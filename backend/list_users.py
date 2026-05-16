import chromadb
import os

CHROMA_PATH = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "chroma_db"))

client = chromadb.PersistentClient(path=CHROMA_PATH)
col = client.get_or_create_collection("user_profiles")

result = col.get(include=["metadatas"])
ids = result["ids"]
metas = result["metadatas"]

print(f"Total profiles stored: {len(ids)}\n")
for uid, meta in zip(ids, metas):
    name = meta.get("name", "N/A")
    print(f"  id   : {uid}")
    print(f"  name : {name}")
    print()
