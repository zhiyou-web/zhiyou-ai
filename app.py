from flask import Flask, request, jsonify, send_from_directory
import requests
import time
import base64

app = Flask(__name__)

# ====================== 填写你的即梦API KEY ======================
JIMENG_API_KEY = "你的即梦API KEY"
# ================================================================

# 首页
@app.route("/")
def index():
    return send_from_directory(".", "index.html")

# 图片/视频上传
@app.route("/api/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    if not file:
        return jsonify({"code":400,"msg":"未上传文件"}),400
    bytes_data = file.read()
    b64 = base64.b64encode(bytes_data).decode()
    return jsonify({"code":200,"base64":f"data:{file.content_type};base64,{b64}"})

# 文生图
@app.route("/api/txt2img", methods=["POST"])
def txt2img():
    try:
        data = request.json
        url = "https://api.jimengai.com/v1/image/generate"
        headers = {"Authorization":f"Bearer {JIMENG_API_KEY}","Content-Type":"application/json"}
        payload = {
            "prompt": data.get("prompt"),
            "model": "image4.0",
            "ratio": "1:1"
        }
        res = requests.post(url, json=payload, headers=headers)
        return jsonify(res.json())
    except Exception as e:
        return jsonify({"code":500,"msg":str(e)})

# 图生图
@app.route("/api/img2img", methods=["POST"])
def img2img():
    try:
        data = request.json
        url = "https://api.jimengai.com/v1/image/img2img"
        headers = {"Authorization":f"Bearer {JIMENG_API_KEY}","Content-Type":"application/json"}
        payload = {
            "prompt": data.get("prompt"),
            "image_url": data.get("image_url"),
            "model": "image4.0",
            "strength": 0.7
        }
        res = requests.post(url, json=payload, headers=headers)
        return jsonify(res.json())
    except:
        return jsonify({"code":500,"msg":"错误"})

# 视频生成（全功能）
@app.route("/api/video", methods=["POST"])
def video():
    try:
        data = request.json
        typ = data.get("type")
        payload = {
            "model": "seedance1.5",
            "prompt": data.get("prompt"),
            "duration": 4,
            "ratio": "1:1"
        }

        if typ == "img2video":
            payload["image_url"] = data.get("img")
        elif typ == "first_last":
            payload["first_frame_url"] = data.get("first")
            payload["last_frame_url"] = data.get("last")
        elif typ == "reference":
            payload["ref_image_url"] = data.get("ref")
        elif typ == "vid2vid":
            payload["ref_video_url"] = data.get("vid")

        url = "https://api.jimengai.com/v1/video/generate"
        headers = {"Authorization":f"Bearer {JIMENG_API_KEY}","Content-Type":"application/json"}
        res = requests.post(url, json=payload, headers=headers)
        return jsonify(res.json())
    except:
        return jsonify({"code":500,"msg":"错误"})

# 查询任务
@app.route("/api/task/<task_id>")
def task(task_id):
    url = f"https://api.jimengai.com/v1/video/task/{task_id}"
    headers = {"Authorization":f"Bearer {JIMENG_API_KEY}"}
    res = requests.get(url, headers=headers)
    return jsonify(res.json())

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
