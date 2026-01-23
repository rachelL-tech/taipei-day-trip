from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Literal
from datetime import date as D
import re

# 定義 API 的 request body
class SignUpIn(BaseModel):
    model_config = ConfigDict(extra="ignore")  # 如果前端送了 schema 沒定義的欄位（例如多送 role），忽略
    name: str = Field(min_length=1) # name 必須是字串，且長度至少 1
    email: str
    password: str = Field(min_length=1) # password 必須是字串，且長度至少 1

    # name 的自訂驗證器
    @field_validator("name") # 指定這個函式專門驗證 name 欄位
    @classmethod
    def name_not_blank(cls, v: str):
        v = v.strip() # 把前後空白去掉（避免 " " 被當作有填）
        if not v: # trim 後仍為空 → 丟錯誤
            raise ValueError("請完整填寫姓名、信箱和密碼") # 讓 FastAPI 回傳 validation error
        return v # 回傳清理後的值（之後 payload.name 就是 trimmed）
    
    # password 的 bcrypt 長度驗證
    @field_validator("password")
    @classmethod
    def password_len_bcrypt(cls, v: str):
        if len(v.encode("utf-8")) > 72:
            raise ValueError("密碼過長")
        return v
    
    @field_validator("email")
    @classmethod
    def email_basic(cls, v: str):
        v = v.strip()
        if "@" not in v:
            raise ValueError("Email 格式不正確")
        return v

# 定義登入 API 的 request body
class SignInIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    email: str
    password: str = Field(min_length=1)

class BookingIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    attractionId: int # 把 "3" 轉成 3，不行就 validation error
    date: D # 把 "2026-01-09" 轉成 datetime.date(2026,1,9)
    time: Literal["morning", "afternoon"] # 只允許 morning/afternoon
    price: int

    # date 不可過去
    @field_validator("date")
    @classmethod
    def date_not_past(cls, v: D):
        if v < D.today():
            raise ValueError("日期不可選擇過去日期")
        return v
    
class ContactIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = Field(min_length=1)
    email: str
    phone: str = Field(min_length=1)

    @field_validator("name", "phone")
    @classmethod
    def strip_not_blank(cls, v: str):
        v = v.strip()
        if not v:
            raise ValueError("聯絡資訊未填完整")
        return v
    
    @field_validator("phone")
    @classmethod
    def phone_basic(cls, v: str):
        digits = re.sub(r"\D", "", v) # 把「非數字」都刪掉（例如 0912-345-678 變 0912345678）
        if len(digits) < 8: # 長度少於 8 視為不合理
            raise ValueError("電話格式不正確")
        return v
    
    @field_validator("email")
    @classmethod
    def email_basic(cls, v: str):
        v = v.strip()
        if "@" not in v:
            raise ValueError("Email 格式不正確")
        return v
    
class OrderIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    prime: str = Field(min_length=1)
    contact: ContactIn