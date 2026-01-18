const TOKEN_KEY = "TOKEN";
const token = localStorage.getItem(TOKEN_KEY);

const number = new URLSearchParams(location.search).get("number"); // location.search 是網址 ? 後面的 query string，new URLSearchParams() 把 query string 變成「可查 key/value」的物件

const order = await fetch(`/api/orders/${encodeURIComponent(number)}`, {
    headers: { Authorization: `Bearer ${token}` }
})
const json = await order.json();

if (json.date.status === 0) showSuccess();
else showFailed();