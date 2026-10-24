# nanochat 内功拆解 · 交互教程

一个离线可用的 HTML 教程，沿着当前 nanochat checkout 的真实代码解释：

- text → tokenizer → embedding
- Q / K / V、RoPE、QK norm、causal mask、softmax、加权求和
- 多头 / GQA / S sliding-window
- Transformer block、logits、pre-training 的一个 step
- best-fit packing、BPB、CORE
- SFT 的聊天模板与 loss mask
- GSM8K 上的简化 GRPO / REINFORCE
- KV cache、prefill/decode、采样、FA3 vs SDPA、推理优化
- 代码地图与单卡运行命令

## 打开方式

直接双击 `index.html` 即可；所有 CSS/JS/字体都是本地的，不需要服务器或联网。

如果只想要一个文件，打开 `nanochat-tutorial.html`（CSS/JS/字体已内联，约 450KB）。

如果浏览器对 `file://` 的本地链接有限制，也可以从仓库根目录起一个简单的静态服务器：

```bash
python -m http.server 8000
# 然后打开 http://localhost:8000/tutorial/
```

## 文件

| 文件 | 作用 |
|---|---|
| `index.html` | 教程内容与交互 lab 的 DOM |
| `styles.css` | 视觉系统、动画、响应式布局 |
| `app.js` | tokenizer / embedding / attention / packing / SFT / RL / KV cache 等交互 |
| `snippets.js` | 从仓库抽取的代码片段（由脚本生成，勿手改） |
| `build_snippets.py` | 按行号从 `nanochat/`、`scripts/` 抽取代码片段 |
| `build_standalone.py` | 生成单文件版 `nanochat-tutorial.html` |
| `nanochat-tutorial.html` | 单文件构建产物（可直接分享/打开） |
| `fonts/` | Noto Sans SC 子集字体，保证中文离线可读 |

如果修改了仓库代码或行号，重新生成代码片段：

```bash
python tutorial/build_snippets.py
```

## 说明

- 教程里的数值（6 个 token、8 维向量、2 个 head、16 个 key）是为了在一屏内看清流程；
  真实 d24 是 24 层、1536 维、12 个 head、2048 context。
- 代码抽屉里的片段直接来自仓库当前 commit，并标注文件与行号。
- “示意曲线”和交互中的随机权重不是训练日志；真实指标以 `val_bpb` / CORE 为准。
