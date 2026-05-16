from pinecone import Pinecone
import os

pc = Pinecone(
    api_key=os.getenv("PINECONE_API_KEY")
)

# For user profiles (Dimension 2304)
index = pc.Index(
    os.getenv("PINECONE_INDEX_NAME")
)

# For episodic memories (Dimension 384)
# We need a separate index because Pinecone indexes have a fixed dimension.
memory_index_name = os.getenv("PINECONE_MEMORY_INDEX_NAME")
memory_index = pc.Index(memory_index_name) if memory_index_name else None
