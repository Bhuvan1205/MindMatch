import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# =========================================================
# DATABASE CONNECTION
# =========================================================

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# =========================================================
# BASE CLASS FOR MODELS
# =========================================================

class Base(DeclarativeBase):
    pass


# =========================================================
# FASTAPI DEPENDENCY — yields a DB session per request
# =========================================================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
