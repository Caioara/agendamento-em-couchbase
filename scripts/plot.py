import json
from pathlib import Path

import matplotlib.pyplot as plt

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_FILE = BASE_DIR / "data" / "results.json"
VULN_FILE = BASE_DIR / "data" / "vulnerability.json"
REPORTS_DIR = BASE_DIR / "reports"

REPORTS_DIR.mkdir(parents=True, exist_ok=True)

with DATA_FILE.open("r", encoding="utf-8") as file:
    results = json.load(file)

with VULN_FILE.open("r", encoding="utf-8") as file:
    vuln = json.load(file)

perf = results["performance"]
labels = ["Insert", "Read", "Update", "Delete"]
throughput = [perf[key]["throughputOps"] for key in ["insert", "read", "update", "delete"]]
latency = [perf[key]["p95Ms"] for key in ["insert", "read", "update", "delete"]]


def add_percent_labels(ax, values):
    total = sum(values)
    if total <= 0:
        return
    for bar, value in zip(ax.patches, values):
        percent = (value / total) * 100
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height(),
            f"{percent:.1f}%",
            ha="center",
            va="bottom",
            fontsize=9,
            color="#333333"
        )


def add_percent_labels_h(ax, values):
    total = sum(values)
    if total <= 0:
        return
    for bar, value in zip(ax.patches, values):
        percent = (value / total) * 100
        ax.text(
            bar.get_width(),
            bar.get_y() + bar.get_height() / 2,
            f"{percent:.1f}%",
            ha="left",
            va="center",
            fontsize=9,
            color="#333333"
        )

fig, ax1 = plt.subplots(figsize=(8, 4.5))
ax1.bar(labels, throughput, color="#1b1b1b", alpha=0.85)
add_percent_labels(ax1, throughput)
ax1.set_ylabel("Throughput (ops/s)")
ax1.set_title("Couchbase - Throughput por operacao")
fig.tight_layout()
fig.savefig(REPORTS_DIR / "throughput.png", dpi=160)
plt.close(fig)

fig, ax2 = plt.subplots(figsize=(8, 4.5))
ax2.bar(labels, latency, color="#c47f33", alpha=0.85)
add_percent_labels(ax2, latency)
ax2.set_ylabel("Latencia p95 (ms)")
ax2.set_title("Couchbase - Latencia p95 por operacao")
fig.tight_layout()
fig.savefig(REPORTS_DIR / "latency.png", dpi=160)
plt.close(fig)

storage_labels = ["Tamanho medio (bytes)", "Total inserido (bytes)"]
storage_values = [
    results["storage"]["averageDocumentBytes"],
    results["storage"]["totalInsertedBytes"],
]

fig, ax3 = plt.subplots(figsize=(7, 4.5))
ax3.bar(storage_labels, storage_values, color="#3a7d44", alpha=0.85)
add_percent_labels(ax3, storage_values)
ax3.set_title("Couchbase - Estimativa de armazenamento")
fig.tight_layout()
fig.savefig(REPORTS_DIR / "storage.png", dpi=160)
plt.close(fig)

security_items = vuln["items"]
security_labels = [item["label"] for item in security_items]
security_scores = [item["score"] for item in security_items]

fig, ax4 = plt.subplots(figsize=(9, 4.5))
ax4.barh(security_labels, security_scores, color="#284b63", alpha=0.9)
add_percent_labels_h(ax4, security_scores)
ax4.set_xlim(0, 1)
ax4.set_xlabel("Score (0 = nao, 0.5 = desconhecido, 1 = sim)")
ax4.set_title("Couchbase - Checklist de vulnerabilidade")
fig.tight_layout()
fig.savefig(REPORTS_DIR / "security.png", dpi=160)
plt.close(fig)

print("Graficos gerados em reports/")
