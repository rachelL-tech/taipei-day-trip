import json # 把 JSON 型別轉成 Python 型別
import re # 使用正則表達式來擷取圖片 URL
import mysql.connector
import os

# 讀取 taipei-attractions.json 檔案
with open('data/taipei-attractions.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

results = data['result']['results']

# 連線到 MySQL
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass
DB_PASSWORD = os.getenv("DB_PASSWORD")
con = mysql.connector.connect(
        host="localhost",
        user="root",
        password=DB_PASSWORD,
        database="taipei_day_trip",
        charset="utf8mb4"
    )
cursor = con.cursor()

# 將資料寫入資料庫
try:
    # # 清空舊資料，避免重複
    # cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
    # cursor.execute("TRUNCATE TABLE attraction_images")
    # cursor.execute("TRUNCATE TABLE attractions")
    # cursor.execute("SET FOREIGN_KEY_CHECKS = 1")

    for result in results:
        id = int(result['_id'])
        name = result['name']
        category = result['CAT']
        description = result['description']
        address = result['address']
        transport = result['direction']
        mrt = result['MRT'] if result['MRT'] else None
        lat = result['latitude']
        lng = result['longitude']
        lat = float(lat) if lat not in (None, "") else None # 及早發現原始資料為空字串、None或非數字的情況，避免被 MySQL 亂轉成 0 或其他值
        lng = float(lng) if lng not in (None, "") else None

        # 處理圖片 URL
        pattern = r'https?://[^\s]+?\.(?:jpg|png)'
        images = re.findall(pattern, result['file'], re.IGNORECASE) # re.findall()輸出為list

        # 寫入資料到 attractions table
        cursor.execute("""
            INSERT INTO attractions 
            (id, name, category, description, address, transport, mrt, lat, lng) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (id, name, category, description, address, transport, mrt, lat, lng))
        
        # 寫入資料到 images table
        for image in images:
            cursor.execute("""
                INSERT INTO images 
                (attraction_id, url) 
                VALUES (%s, %s)
            """, (id, image))

        con.commit()
        print("匯入完成！")

except Exception as e:
    con.rollback()
    print("匯入失敗，已 rollback：", e) # 印出錯誤訊息的文字。type(e)會印出錯誤的類型，例如 <class 'ValueError'>、e.args 會印出錯誤的參數 tuple

# 關閉連線
finally:    
    cursor.close()
    con.close()
