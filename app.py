from fastapi import *
from fastapi.responses import FileResponse, JSONResponse
from typing import Optional
import mysql.connector.pooling
import os
from dotenv import load_dotenv
load_dotenv()

app = FastAPI()

PAGE_SIZE = 8 # 固定每頁 8 筆

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_NAME = os.getenv("DB_NAME", "taipei_day_trip")
DB_PASSWORD = os.getenv("DB_PASSWORD")

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

def get_connection():
	return pool.get_connection()

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
			where_sql = "WHERE " + " AND ".join(where_clauses) # 注意空格
		
		# 先取出總筆數
		cursor.execute(f"SELECT COUNT(*) AS total FROM attractions {where_sql}", params)
		total_result = cursor.fetchone()["total"] # 因為 dictionary=True 會回傳字典，所以可以用欄位名稱取值。不取別名時，欄位名稱是 COUNT(*)

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
		data_params = params + [PAGE_SIZE, offset] # 把前面組好的參數加上分頁參數
		cursor.execute(data_sql, data_params)
		attractions = cursor.fetchall()

		# 取出景點對應的圖片
		attraction_ids = [attraction["id"] for attraction in attractions] # 取出所有景點 id，並組成 list
		# 對於 attraction_ids 裡的每個 id，建立一個 key = id、value = [] 的 pair，避免後面.append(...)不會遇到「KeyError」
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
				"images": images.get(id, [])
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
		images = [row["url"] for row in image_rows] # list comprehension，取出所有圖片 URL，組成 list

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
@app.get("/", include_in_schema=False)
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