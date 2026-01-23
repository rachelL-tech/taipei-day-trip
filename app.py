from fastapi import * # 包含FastAPI, Request（讀 request body / headers）
from fastapi.responses import FileResponse, JSONResponse # 以自訂 status code 的 JSON 回應
from fastapi.staticfiles import StaticFiles
from typing import Optional
import mysql.connector.pooling
import os # 讀取環境變數用（DB 連線、JWT_SECRET）
from dotenv import load_dotenv
import time  # 產生 token 過期時間（exp）用 UNIX timestamp
import jwt # PyJWT：負責 JWT encode / decode
import bcrypt  # bcrypt：雜湊密碼與驗證密碼
import json
import random
from datetime import datetime
from urllib.request import Request as urlRequest, urlopen
from urllib.error import URLError, HTTPError
from schemas import * 
from fastapi.exceptions import RequestValidationError

app = FastAPI()

PAGE_SIZE = 8 # 固定每頁 8 筆景點資料

load_dotenv() # 找到專案資料夾裡的 .env 檔，把裡面的設定載入到系統的環境變數中

## 資料庫連線設定
DB_HOST = os.getenv("DB_HOST", "localhost") # 去系統的環境變數裡找 DB_HOST → 如果 .env 有設定、且 load_dotenv() 有成功執行，就會回傳 .env 裡 DB_HOST 的值。如果找不到 DB_HOST 這個環境變數，就回傳 "localhost"
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME", "taipei_day_trip")
dbconfig = {
		"host": DB_HOST,
		"user": DB_USER,
		"password": DB_PASSWORD,
		"database": DB_NAME,
		"charset": "utf8mb4"
}
pool = mysql.connector.pooling.MySQLConnectionPool(
	pool_name="website_pool",
	pool_size=5,
	pool_reset_session=True,
	**dbconfig
)
# 從 pool 拿連線
def get_connection():
	con = pool.get_connection()
	con.ping(reconnect=True) # 如果連線已被 server 斷掉 → driver 會幫你「重連」並把連線恢復到可用狀態
	return con

## JWT 設定
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")  # JWT 簽章密鑰
JWT_ALG = "HS256"  # JWT 使用 HS256 演算法（對稱式：同一把 secret 簽章與驗證）
JWT_EXPIRE_SECONDS = 7 * 24 * 60 * 60  # token 有效期 7 天
# 產生 JWT token（本身是由伺服器簽發，不是密碼算出來的，代表某時某刻，伺服器曾經認證過這個人，並允許他在某段時間內帶著這個 token 行動）
def make_token(user_id: int, name: str, email: str):
    payload = {  # JWT payload（放在 token 裡的「聲明」）
        "id": user_id,
        "name": name,
        "email": email, 
        "exp": int(time.time()) + JWT_EXPIRE_SECONDS, # 到期時間（現在 + 7 天）
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG) # 用 secret 對 payload 簽章，得到 token。 encode 要用字串，代表指定這次要用哪一種演算法簽
    if isinstance(token, bytes): # 有些環境 jwt.encode 可能回 bytes
        token = token.decode("utf-8") # 轉成字串給前端
    return token
# 從 Authorization: Bearer <token> 取出 token 字串
def get_bearer_token(request: Request):
    auth = request.headers.get("Authorization")  # 讀取 Authorization header
    if auth is None: # 沒有 header：代表未登入
        return None
    if not auth.startswith("Bearer "): # 格式不對：當作未登入
        return None
    token = auth[7:].strip() # 把 "Bearer " 去掉，只留下 token（並去空白）
    if token == "": # token 空字串：當作未登入
        return None
    return token
# 從 request 讀取並驗證 token，回傳 payload（或 None）
def get_current_user(request: Request):
	token = get_bearer_token(request)
	if not token:
		return None
	try:
		payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG]) # decode 時要用list / iterable的型別，代表允許哪些演算法的 token 被接受
		return payload
	except: # token 是壞掉的字串、簽章不對（secret 不匹配 / 被竄改）、token 過期、algorithms 不符合、程式自己的 bug（JWT_SECRET 沒定義、JWT_ALG 打錯字）
		return None

## TapPay 設定
TAPPAY_PARTNER_KEY = os.getenv("TAPPAY_PARTNER_KEY")
TAPPAY_MERCHANT_ID = os.getenv("TAPPAY_MERCHANT_ID")
TAPPAY_PAY_BY_PRIME_URL = os.getenv(
    "TAPPAY_PAY_BY_PRIME_URL",
    "https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime"
)
# 呼叫 TapPay（dict → JSON bytes → POST → JSON dict）
def tappay_pay_by_prime(prime: str, amount: int, order_number: str, contact: dict):
    if not TAPPAY_PARTNER_KEY or not TAPPAY_MERCHANT_ID:
        raise RuntimeError("TapPay keys not configured (.env missing)")

	# 組 TapPay API 的 request body
    payload = {
        "prime": prime,
        "partner_key": TAPPAY_PARTNER_KEY,
        "merchant_id": TAPPAY_MERCHANT_ID,
        "amount": int(amount),
		"currency": "TWD",
        "details": "TapPay Test",
        "order_number": order_number,
        "cardholder": {
            "phone_number": contact["phone"],
            "name": contact["name"],
            "email": contact["email"],
        },
    }

	# 把 payload 變成 JSON bytes（HTTP request body 必須是 bytes）
    data = json.dumps(payload).encode("utf-8")

	# 建立 HTTP Request 物件
    req = urlRequest(
        TAPPAY_PAY_BY_PRIME_URL, # API endpoint
        headers={
            "Content-Type": "application/json",
            "x-api-key": TAPPAY_PARTNER_KEY, # TapPay 用這個 header 驗證
        },
        method="POST", # TapPay 的 Pay-by-Prime 是 POST
		data=data, # request body
    )

	# 送出 request，讀回 response（把 prime + 金額 + merchant/partner 資訊送到 TapPay，TapPay 會去跟銀行做授權，再傳回交易成功/失敗與原因）
    try: 
        with urlopen(req, timeout=30) as resp: # 最多等 30 秒
            body = resp.read().decode("utf-8") # 讀取 response body（bytes），轉成 JSON 字串
            return json.loads(body) # 把 JSON 字串轉回 Python dict
    except HTTPError as e: # TapPay 伺服器回 HTTPError
        body = e.read().decode("utf-8") if getattr(e, "fp", None) else ""  # e.read()：讀取放在 body 的 JSON 錯誤訊息；getattr(e, "fp", None)：拿物件 e 身上的屬性 "fp"，如果 e 沒有這個屬性，就回傳 None　→ 確保有 body 才讀
        try: # 如果 body 是 JSON，就 parse 成 dict 回傳；如果沒有 body，就回傳自訂 dict
            return json.loads(body) if body else {"status": -1, "msg": f"HTTPError {e.code}"}
        except Exception: # 如果 body 不是 JSON（HTML 或純文字），就直接把 body 塞到 msg
            return {"status": -1, "msg": body or f"HTTPError {getattr(e, 'code', '')}"}
    except URLError as e: # 網路層錯誤：DNS、連不上、timeout、被擋
        return {"status": -1, "msg": f"URLError: {getattr(e, 'reason', str(e))}"}


## 路由
# 註冊一個新的會員
@app.post("/api/user")
async def user_signup(payload: SignUpIn):
	name = payload.name  # 取 name
	email = str(payload.email).strip()  # 取 email
	password = payload.password  # 取 password
	
	con = None
	cursor = None

	try:
		con = get_connection()
		cursor = con.cursor(dictionary=True)

		cursor.execute("SELECT id FROM users WHERE email=%s", (email,))
		existing = cursor.fetchone()
		if existing:
			return JSONResponse(status_code=400, content={"error": True, "message": "Email已經註冊帳戶"})
		
		# 把明文密碼做 bcrypt 雜湊，再存進資料庫
		pw_bytes = password.encode("utf-8") # 人類看的 str → 電腦看的 bytes
		if len(pw_bytes) > 72: # 因為 bcrypt 只安全處理前 72 個 「byte」，再多會被截斷
			return JSONResponse(status_code=400, content={"error": True, "message": " 密碼過長"})
		pw_hash = bcrypt.hashpw(pw_bytes, bcrypt.gensalt()).decode("utf-8") # bcrypt.hashpw()回傳的是 bytes，用.decode()轉回 str

		cursor.execute(
            "INSERT INTO users(name, email, password_hash) VALUES(%s, %s, %s)",  
            (name, email, pw_hash),
        )
		con.commit()
		return {"ok": True}

	except Exception as e:
		if con:
			con.rollback()
		return JSONResponse(status_code=500, content={"error": True, "message": str(e)})

	finally:
		if cursor is not None: 
			cursor.close()
		if con is not None:
			con.close()

# 登入會員帳戶
@app.put("/api/user/auth")
async def signin(payload: SignInIn):
	email = str(payload.email).strip()
	password = payload.password

	if email == "" or password == "": 
		return JSONResponse(status_code=400, content={"error": True, "message": "請輸入信箱和密碼"})
	
	con = None
	cursor = None

	try:
		con = get_connection()
		cursor = con.cursor(dictionary=True)

		cursor.execute("SELECT id, name, email, password_hash FROM users WHERE email=%s",(email,))
		row = cursor.fetchone()
		
		if not row: # 找不到使用者
			return JSONResponse(status_code=400, content={"error": True, "message": "電子郵件或密碼錯誤"}) # 不要讓使用者知道是帳號還是密碼錯誤
		pw_ok = bcrypt.checkpw(
			password.encode("utf-8"),
			row["password_hash"].encode("utf-8"),
		) # checkpw()從第二個參數（hash）裡拆出演算法版本、cost、salt 後，用同一組設定 + 同一個 salt，拿第一個參數的密碼重算一次 bcrypt，比較「重算出來的 hash」和「資料庫這串 hash」是不是一樣，再回傳 True（密碼正確） / False
		if not pw_ok: # 明碼不符合雜湊
			return JSONResponse(status_code=400, content={"error": True, "message": "電子郵件或密碼錯誤"})
		
		token = make_token(row["id"], row["name"], row["email"]) # 產生 JWT token

		return {"token": token} # 給前端存 LocalStorage

	except Exception as e:
		if con:
			con.rollback()
		return JSONResponse(status_code=500, content={"error": True, "message": str(e)})

	finally:
		if cursor is not None: 
			cursor.close()
		if con is not None:
			con.close()
	
# 取得當前登入的會員資訊
@app.get("/api/user/auth")
def get_user(request: Request): # 用 request 拿 Authorization header
	payload = get_current_user(request)
	if not payload: # 沒 token / token 無效、過期 / 驗章失敗
		return {"data": None} 
	
	return {
		"data": {
			"id": payload["id"],
			"name": payload["name"],
			"email": payload["email"],
		}
	}

# 取得景點資料列表
@app.get("/api/attractions")
async def get_attractions(
	page: int = Query(..., ge=0),
	category: Optional[str] = None,
	keyword: Optional[str] = None,
):
	offset = page * PAGE_SIZE # 算出要跳過前面幾筆（搭配 OFFSET offset ）

	con = None
	cursor = None

	try:
		con = get_connection()
		cursor = con.cursor(dictionary=True)

		# 組合 where 動態條件
		where_clauses = []
		params = []
		if category:
			where_clauses.append("category = %s")
			params.append(category)
		if keyword:
			where_clauses.append("(mrt = %s OR name LIKE %s)")
			params.append(keyword) # 第一個 %s（for mrt）
			params.append(f"%{keyword}%") # 第二個 %s（for name）。%abc% 代表包含 abc 的任何字串
		where_sql = ""
		if where_clauses: # 有累積到至少一個條件
			where_sql = "WHERE " + " AND ".join(where_clauses) # 注意 WHERE、AND 後面要有空格
		
		# 先取出總筆數
		cursor.execute(f"SELECT COUNT(*) AS total FROM attractions {where_sql}", params)
		total_result = cursor.fetchone()["total"] # 因為 dictionary=True 回傳的是字典，所以可以用欄位名稱取值。不取別名時，欄位名稱是 COUNT(*)

		if total_result == 0 or offset >= total_result:
			return {
				"nextPage": None,
				"data": []
			}
		
		# 再取出分頁資料
		data_sql = f"""
			SELECT id, name, category, description, address, transport, mrt, lat, lng
			FROM attractions
			{where_sql}
			ORDER BY id
			LIMIT %s OFFSET %s
		"""
		data_params = params + [PAGE_SIZE, offset]
		cursor.execute(data_sql, data_params)
		attractions = cursor.fetchall()

		# 取出景點對應的圖片
		attraction_ids = [attraction["id"] for attraction in attractions] # 取出所有景點 id，並組成 list
		# 對於 attraction_ids 裡的每個 id，建立一個 key = id、value = [] 的 pair，避免後面images[id].append(...)遇到「KeyError」
		images = {}
		for id in attraction_ids:
			images[id] = [] 
		if attraction_ids:
			format_strings = ",".join(["%s"] * len(attraction_ids)) # 產生 %s,%s,%s,... 字串
			# 用 WHERE IN (%s, %s, %s) 一次查全部 id 對應的圖片
			img_sql = f"""
				SELECT attraction_id, url
				FROM images
				WHERE attraction_id IN ({format_strings}) 
			"""
			cursor.execute(img_sql, attraction_ids)
			image_rows = cursor.fetchall()
			for row in image_rows:
				id = row["attraction_id"]
				images[id].append(row["url"]) # 把圖片 URL 加到對應景點 id 的 list 裡
		
		# 組成回傳資料
		result_data = []
		for attraction in attractions:
			id = attraction["id"]
			result_data.append({
				"id": id,
				"name": attraction["name"],
				"category": attraction["category"],
				"description": attraction["description"],
				"address": attraction["address"],
				"transport": attraction["transport"],
				"mrt": attraction["mrt"],
				"lat": attraction["lat"],
				"lng": attraction["lng"],
				"images": images.get(id, []) # 從 images 取鍵 id 的值。若鍵不存在，就回傳預設值 []
			})
		
		# 計算 nextPage
		if offset + PAGE_SIZE >= total_result:
			next_page = None
		else:
			next_page = page + 1

		return {
			"nextPage": next_page,
			"data": result_data
		}

	except mysql.connector.Error as e:
		if con:
			con.rollback()
		return JSONResponse(status_code=500, content={"error": True, "message": str(e)})
	
	finally:
		if cursor:
			cursor.close()
		if con:
			con.close()

# 根據景點編號取得景點資料
@app.get("/api/attraction/{attractionId}")
async def get_attraction(attractionId: int):
	con = None
	cursor = None

	try:
		con = get_connection()
		cursor = con.cursor(dictionary=True)

		# 取出景點資料
		attraction_sql = """
			SELECT id, name, category, description, address, transport, mrt, lat, lng
			FROM attractions
			WHERE id = %s
		"""
		cursor.execute(attraction_sql, (attractionId,))
		attraction = cursor.fetchone()
		if not attraction:
			return JSONResponse(status_code=400, content={"error": True, "message": "景點編號不正確"})
		
		# 取出景點圖片
		image_sql = """
			SELECT url
			FROM images
			WHERE attraction_id = %s
		"""
		cursor.execute(image_sql, (attractionId,))
		image_rows = cursor.fetchall()
		images = [row["url"] for row in image_rows] # list comprehension：取出所有圖片 URL，組成 list

		result_data = {
			"id": attraction["id"],
			"name": attraction["name"],
			"category": attraction["category"],
			"description": attraction["description"],
			"address": attraction["address"],
			"transport": attraction["transport"],
			"mrt": attraction["mrt"],
			"lat": attraction["lat"],
			"lng": attraction["lng"],
			"images": images
		}

		return {"data": result_data}

	except mysql.connector.Error as e:
		if con:
			con.rollback()
		return JSONResponse(status_code=500, content={"error": True, "message": str(e)})
	
	finally:
		if cursor:
			cursor.close()
		if con:
			con.close()

# 取得景點分類名稱列表
@app.get("/api/categories")
async def get_categories():
	con = None
	cursor = None

	try:
		con = get_connection()
		cursor = con.cursor(dictionary=True)

		category_sql = """
			SELECT DISTINCT category
			FROM attractions
			WHERE category IS NOT NULL AND category <> ''
			ORDER BY category
		"""
		cursor.execute(category_sql)
		rows = cursor.fetchall()
		categories = [row["category"] for row in rows]

		return {"data": categories}

	except mysql.connector.Error as e:
		if con:
			con.rollback()
		return JSONResponse(status_code=500, content={"error": True, "message": str(e)})
	
	finally:
		if cursor:
			cursor.close()
		if con:
			con.close()

# 取得捷運站名稱列表
@app.get("/api/mrts")
async def get_mrts():
	con = None
	cursor = None

	try:
		con = get_connection()
		cursor = con.cursor(dictionary=True)

		mrt_sql = """
			SELECT
				mrt,
				COUNT(*) AS attraction_count
			FROM attractions
			WHERE mrt IS NOT NULL AND mrt <> ''
			GROUP BY mrt
			ORDER BY attraction_count DESC, mrt ASC;
		"""
		cursor.execute(mrt_sql)
		rows = cursor.fetchall()
		mrt = [row["mrt"] for row in rows]
		return {"data": mrt}

		
	except mysql.connector.Error as e:
		if con:
			con.rollback()
		return JSONResponse(status_code=500, content={"error": True, "message": str(e)})
	
	finally:
		if cursor:
			cursor.close()
		if con:
			con.close()

# 取得尚未下單的預定行程
@app.get("/api/booking")
async def get_booking(request: Request):
	user_id = get_current_user(request).get("id")
	if not user_id:
		return JSONResponse(status_code=403, content={"error": True, "message": "未登入系統，拒絕存取"})

	con = None
	cursor = None
	try:
		con = get_connection()
		cursor = con.cursor(dictionary=True)

		cursor.execute(
			"SELECT attraction_id, date, time, price FROM bookings WHERE user_id=%s", (user_id,)
		)
		booking = cursor.fetchone()
		if not booking: # null 表示沒有資料
			return {"data": None}
		
		attraction_id = booking["attraction_id"]
		cursor.execute(
			"SELECT id, name, address FROM attractions WHERE id=%s", (attraction_id,)
		)
		info = cursor.fetchone()
		if not info: # 正常不該發生，因為 booking 裡的 attraction_id 有設 foreign key constraints（FOREIGN KEY (attraction_id) REFERENCES attractions(id) ON DELETE CASCADE），不可能 INSERT/UPDATE 不存在的景點；就算景點被刪除，也不會留下該筆 booking
			return JSONResponse(status_code=500, content={"error": True, "message": "預定行程的景點不存在"})
		
		cursor.execute(
			"SELECT url FROM images WHERE attraction_id=%s LIMIT 1", (attraction_id,)
		)
		img = cursor.fetchone()
		img_url = img["url"] if img else ""
	
		return {
			"data": {
				"attraction": {
					"id": info["id"],
					"name": info["name"],
					"address": info["address"],
					"image": img_url
				},
				"date": booking["date"], # 用 JSONResponse(status_code=200, content=...)時，要加.isoformat() 把 datetime.date 物件轉成字串
				"time": booking["time"],
				"price": booking["price"]
			}
		}
	
	except Exception as e:
		if con:
			con.rollback()
		return JSONResponse(status_code=500, content={"error": True, "message": str(e)})
	
	finally:
		if cursor:
			cursor.close()
		if con:
			con.close()
	
# 建立新的預定行程
@app.post("/api/booking")
async def create_booking(request: Request, payload: BookingIn):
	payload = get_current_user(request)
	if not payload:
		return JSONResponse(status_code=403, content={"error": True, "message": "未登入系統，拒絕存取"})
	user_id = payload["id"]
	
	# 進 DB 前做基本驗證
	attraction_id = payload.attractionId
	date = payload.date # 已是 datetime.date
	time = payload.time
	price = payload.price
	try:
		attraction_id = int(attraction_id)
		price = int(price)
	except: # int()失敗的情形，如傳入 None（TypeError：傳 Null、缺欄位） / 空字串、空白字串（ValueError） / 非數字字串（ValueError）） / 浮點數字串（ValueError）/ 其他型別（TypeError：像[]）
		return JSONResponse(status_code=400, content={"error": True, "message": "建立失敗，輸入不正確或其他原因"})
	if not date or time not in ["morning", "afternoon"]: # date 不能是空的或 None（因為date DATE NOT NULL）；time 只能是 morning / afternoon
		return JSONResponse(status_code=400, content={"error": True, "message": "建立失敗，輸入不正確或其他原因"})
	
	con = None
	cursor = None
	try:
		con = get_connection()
		cursor = con.cursor(dictionary=True)
		sql = """
			INSERT INTO bookings(user_id, attraction_id, date, time, price)
			VALUES(%s, %s, %s, %s, %s)
			ON DUPLICATE KEY UPDATE
				attraction_id = VALUES(attraction_id),
				date = VALUES(date),
				time = VALUES(time),
				price = VALUES(price)
		"""  # 「ON DUPLICATE KEY UPDATE」當插入的資料違反 UNIQUE KEY 或 PRIMARY KEY 的 constraints 時，就改成 UPDATE（覆蓋）
		cursor.execute(sql, (user_id, attraction_id, date, time, price))
		con.commit()
		return {"ok": True}
	
	except Exception as e:
		if con:
			con.rollback()
		return JSONResponse(status_code=500, content={"error": True, "message": str(e)})
	
	finally:
		if cursor:
			cursor.close()
		if con:
			con.close()

# 刪除目前的預定行程
@app.delete("/api/booking")
async def delete_booking(request: Request):
	user_id = get_current_user(request).get("id")
	if not user_id:
		return JSONResponse(status_code=403, content={"error": True, "message": "未登入系統，拒絕存取"})
	
	con = None
	cursor = None
	try:
		con = get_connection()
		cursor = con.cursor()
		cursor.execute("DELETE FROM bookings WHERE user_id=%s", (user_id,))
		con.commit()
		return {"ok": True}
	
	except Exception as e:
		if con:
			con.rollback()
		return JSONResponse(status_code=500, content={"error": True, "message": str(e)})
	
	finally:
		if cursor:
			cursor.close()
		if con:
			con.close()

# 建立新的訂單，並串接第三方金流，完成付款程序
@app.post("/api/orders")
async def create_order(request: Request, payload: OrderIn):
	# 驗權限
	payload = get_current_user(request)
	if not payload:
		return JSONResponse(status_code=403, content={"error": True, "message": "未登入系統，拒絕存取"})
	user_id = payload["id"]
	
	# 解析 prime + order + contact
	prime = payload.prime.strip()
	contact_name = payload.contact.name.strip()
	contact_email = str(payload.contact.email).strip()
	contact_phone = payload.contact.phone.strip()

	if not prime or not contact_name or not contact_email or not contact_phone:
		return JSONResponse(status_code=400, content={"error": True, "message": "訂單建立失敗，輸入不正確或其他原因"})

	con = None
	cursor = None
	try:
		con = get_connection()
		cursor = con.cursor(dictionary=True)
		
		# booking 資訊 以 DB 為準（不要相信前端，避免被竄改）
		cursor.execute("SELECT attraction_id, date, time, price FROM bookings WHERE user_id=%s", (user_id,))
		booking = cursor.fetchone()
		attraction_id = booking["attraction_id"]
		date = booking["date"]
		time = booking["time"]
		price = int(booking["price"])

		# 寫入 DB：有 order 時覆蓋；沒 order 時建立
		# 找「同一 booking 」最新的 UNPAID 訂單
		cursor.execute(
            """
            SELECT id, order_number
            FROM orders
            WHERE user_id=%s
              AND status='UNPAID'
              AND attraction_id=%s
              AND date=%s
              AND time=%s
              AND price=%s
            """,
            (user_id, attraction_id, date, time, price)
        )
		existing = cursor.fetchone()
		if existing:
			order_id = existing["id"]
			order_number = existing["order_number"]
			cursor.execute(
                """
                UPDATE orders
                SET contact_name=%s, contact_email=%s, contact_phone=%s
                WHERE id=%s
                """,
                (contact_name, contact_email, contact_phone, order_id)
            )
		else:
			# 建 order_number：「目前系統時間（秒）」＋「4 位數隨機碼」
			order_number = datetime.now().strftime("%Y%m%d%H%M%S") + f"{random.randint(0, 9999):04d}" # f"{...:04d}" 把 0 ~ 9999 的整數補成固定 4 位數（不足左邊補 0）

			insert_order_sql = """
				INSERT INTO orders
				(order_number, user_id, attraction_id, date, time, price, contact_name, contact_email, contact_phone, status)
				VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'UNPAID')
			"""
			cursor.execute(insert_order_sql, (order_number, user_id, attraction_id, date, time, price, contact_name, contact_email, contact_phone))
			
			order_id = cursor.lastrowid # 剛剛那次 INSERT 產生的資料的 id（因為主鍵 id 是 AUTO_INCREMENT 自動產生的）
		con.commit()

		# 呼叫 TapPay 付款
		tappay_result = tappay_pay_by_prime(
            prime=prime,
            amount=price,
            order_number=order_number,
            contact={"name": contact_name, "email": contact_email, "phone": contact_phone}
        )

		# 寫入 payment record（成功/失敗都要存）+ 更新 order 狀態
		tappay_status = int(tappay_result.get("status", -1)) # -1 表示非 TapPay 正常回應的失敗（如：網路錯誤 / timeout / 回傳不是 JSON / 錯誤 dict）
		tappay_msg = str(tappay_result.get("msg", ""))[:255]

		cursor.execute(
			"""
            INSERT INTO payments(order_id, tappay_status, tappay_msg)
            VALUES(%s,%s,%s)
            """,
            (order_id, tappay_status, tappay_msg)
        )

		if tappay_status == 0:
			cursor.execute("UPDATE orders SET status='PAID' WHERE id=%s", (order_id,))
			cursor.execute("DELETE FROM bookings WHERE user_id=%s", (user_id,))
		con.commit()

		return {
			"data": {
				"number": order_number,
				"payment": {
					"status": 0 if (tappay_status == 0) else 1,
					"message": "付款成功" if (tappay_status == 0) else "付款失敗"
				}
			}
		}

	except Exception as e:
		if con:
			con.rollback()
		return JSONResponse(status_code=500, content={"error": True, "message": str(e)})
	finally:
		if cursor:
			cursor.close()
		if con:
			con.close()

# 根據訂單編號取得訂單資訊
@app.get("/api/order/{orderNumber}")
async def get_order(orderNumber: str, request: Request):
	payload = get_current_user(request)
	if not payload:
		return JSONResponse(status_code=403, content={"error": True, "message": "未登入系統，拒絕存取"})
	user_id = payload["id"]

	con = None
	cursor = None
	try:
		con = get_connection()
		cursor = con.cursor(dictionary=True)

		sql = """
			SELECT
				o.order_number,
				o.attraction_id,
				o.price,
				o.date,
				o.time,
				o.contact_name,
				o.contact_email,
				o.contact_phone,
				o.status AS order_status,
				a.name AS attraction_name,
				a.address AS attraction_address,
				(SELECT url FROM images WHERE attraction_id = o.attraction_id LIMIT 1) AS attraction_image
			FROM orders o
			JOIN attractions a ON o.attraction_id = a.id
			WHERE o.order_number = %s AND o.user_id = %s
		"""
		cursor.execute(sql, (orderNumber, user_id))
		row = cursor.fetchone()

		if not row:
			return JSONResponse(status_code=400, content={"error": True, "message": "訂單編號不正確"})
		
		date_val = row["date"].isoformat() # row["date"]是Python 的 datetime.date 物件，要轉字串
		paid = (row["order_status"] == "PAID")

		return {
			"data": {
				"number": row["order_number"],
				"price": row["price"],
				"trip": {
					"attraction": {
						"id": row["attraction_id"],
						"name": row["attraction_name"],
						"address": row["attraction_address"],
						"image": row["attraction_image"] or ""
					},
					"date": date_val,
					"time": row["time"]
				},
				"contact": {
					"name": row["contact_name"],
					"email": row["contact_email"],
					"phone": row["contact_phone"]
				},
				"status": 0 if paid else 1 # 0=已付款、1=未付款
			}
		}

	except Exception as e:
		if con:
			con.rollback()
		return JSONResponse(status_code=500, content={"error": True, "message": str(e)})

	finally:
		if cursor:
			cursor.close()
		if con:
			con.close()

# 把 Pydantic 驗證失敗的 error 轉成 400
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    # 把第一個錯誤訊息取出來
    msg = exc.errors()[0].get("msg", "輸入不正確或其他原因")
    return JSONResponse(status_code=400, content={"error": True, "message": msg})

# Static Pages (Never Modify Code in this Block)
@app.get("/", include_in_schema=False) # include_in_schema=False 會把這個路由從 API 文件中隱藏
async def index(request: Request):
	return FileResponse("./static/index.html", media_type="text/html")
@app.get("/attraction/{id}", include_in_schema=False)
async def attraction(request: Request, id: int):
	return FileResponse("./static/attraction.html", media_type="text/html")
@app.get("/booking", include_in_schema=False)
async def booking(request: Request):
	return FileResponse("./static/booking.html", media_type="text/html")
@app.get("/thankyou", include_in_schema=False)
async def thankyou(request: Request):
	return FileResponse("./static/thankyou.html", media_type="text/html")

app.mount("/static", StaticFiles(directory="static"))