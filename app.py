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

app = FastAPI()

PAGE_SIZE = 8 # 固定每頁 8 筆景點資料

load_dotenv() # 找到專案資料夾裡的 .env 檔，讀取，把裡面的設定載入到系統的環境變數（environment variables）中

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
	return pool.get_connection()

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

## 路由
# 註冊一個新的會員
@app.post("/api/user")
async def user_signup(body: dict = Body(...)):
	name = str(body.get("name", "")).strip()  # 取 name，轉字串並去掉前後空白
	email = str(body.get("email", "")).strip()  # 取 email，轉字串並去掉前後空白
	password = str(body.get("password", ""))  # 取 password

	if name == "" or email == "" or password == "": 
		return JSONResponse(status_code=400, content={"error": True, "message": "請完整填寫姓名、信箱和密碼"})
	
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
async def signin(body: dict = Body(...)):
	email = str(body.get("email", "")).strip()
	password = str(body.get("password", ""))

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
	token = get_bearer_token(request)
	if not token: # 沒 token 表示沒登入
		return {"data": None} 
	
	try: # 解碼 token
		payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG]) # decode 時要用list / iterable的型別，代表允許哪些演算法的 token 被接受
		return {
			"data": {
				"id": payload["id"],
                "name": payload["name"],
                "email": payload["email"],
			}
		}
	except: # token 無效 / 過期 / 驗章失敗
		return {"data": None}

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