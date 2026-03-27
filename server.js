const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const multer = require('multer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====================== 你只改这里 ======================
const VOLC_ACCESS_KEY = "你自己的AK";
const VOLC_SECRET_KEY = "你自己的SK";
// =======================================================

const storage = multer.memoryStorage();
const upload = multer({ storage });
const PORT = process.env.PORT || 10000;

function sign(method, uri, params, body, dateStr) {
  const canonicalQuery = Object.keys(params)
    .sort()
    .map(k => `${k}=${encodeURIComponent(params[k])}`)
    .join('&');
  const canonicalHeaders = "host:open.volcengineapi.com\n";
  const signedHeaders = "host";
  const payloadHash = crypto.createHash('sha256').update(body || "").digest("hex");
  const canonicalRequest = `${method}\n${uri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStr}/cn-north-1/llm_compose/request`;
  const ts = Math.floor(Date.now() / 1000);
  const stringToSign = `HMAC-SHA256\n${ts}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest("hex")}`;

  const kDate = crypto.createHmac("sha256", VOLC_SECRET_KEY).update(dateStr).digest();
  const kRegion = crypto.createHmac("sha256", kDate).update("cn-north-1").digest();
  const kService = crypto.createHmac("sha256", kRegion).update("llm_compose").digest();
  const kSigning = crypto.createHmac("sha256", kService).update("request").digest();
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  return `HMAC-SHA256 Credential=${VOLC_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

async function submitTask(body, Action) {
  const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const params = { Action, Version: "2024-08-15" };
  const bodyStr = JSON.stringify(body);
  const auth = sign("POST", "/", params, bodyStr, dateStr);

  return axios.post("https://open.volcengineapi.com/", bodyStr, {
    params,
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
      "X-Date": dateStr,
      "X-Timestamp": Math.floor(Date.now() / 1000),
    },
  });
}

async function getTaskResult(TaskId) {
  const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const params = {
    Action: "GetTaskResult",
    Version: "2024-08-15",
    TaskId,
  };
  const auth = sign("GET", "/", params, "", dateStr);

  return axios.get("https://open.volcengineapi.com/", {
    params,
    headers: {
      Authorization: auth,
      "X-Date": dateStr,
      "X-Timestamp": Math.floor(Date.now() / 1000),
    },
  });
}

app.post("/api/generate", upload.any(), async (req, res) => {
  try {
    const { prompt, mode } = req.body;
    if (!prompt || !mode) return res.status(400).json({ error: "缺少参数" });

    let Action, ModelName, body = { Prompt: prompt };

    switch (mode) {
      case "text2img":
        Action = "SubmitTextToImageTask";
        ModelName = "doubao_image";
        break;
      case "text2video":
        Action = "SubmitTextToVideoTask";
        ModelName = "doubao_video";
        break;
      case "img2video":
        Action = "SubmitImageToVideoTask";
        ModelName = "doubao_img2video";
        const img1 = req.files?.find(f => f.fieldname === "img1");
        if (img1) body.ImageBase64 = img1.buffer.toString("base64");
        break;
      case "headtail2video":
        Action = "SubmitHeadTailToVideoTask";
        ModelName = "doubao_headtail";
        const head = req.files?.find(f => f.fieldname === "head");
        const tail = req.files?.find(f => f.fieldname === "tail");
        if (head) body.HeadImageBase64 = head.buffer.toString("base64");
        if (tail) body.TailImageBase64 = tail.buffer.toString("base64");
        break;
      case "ref2video":
        Action = "SubmitReferenceToVideoTask";
        ModelName = "doubao_ref_video";
        const refs = req.files?.filter(f => f.fieldname === "refs[]") || [];
        body.RefImagesBase64 = refs.map(f => f.buffer.toString("base64"));
        break;
      default:
        return res.status(400).json({ error: "不支持的模式" });
    }

    body.ModelName = ModelName;
    const submitResp = await submitTask(body, Action);
    const TaskId = submitResp.data?.Result?.TaskId;
    if (!TaskId) return res.status(500).json({ error: "任务提交失败" });

    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const resultResp = await getTaskResult(TaskId);
      const status = resultResp.data?.Result?.Status;

      if (status === "success") {
        return res.json({
          type: mode === "text2img" ? "image" : "video",
          url: resultResp.data.Result.ImageUrl || resultResp.data.Result.VideoUrl || "",
        });
      }
      if (status === "fail") {
        return res.status(500).json({ error: "生成失败" });
      }
    }

    return res.status(504).json({ error: "任务超时" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.use(express.static("."));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});