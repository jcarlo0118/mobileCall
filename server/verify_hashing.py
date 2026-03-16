import bcrypt
import sqlite3
import os

# Mock the database setup for testing
DB_NAME = 'test_userDatabase.db'

def get_test_connection():
    return sqlite3.connect(DB_NAME)

def setup_test_db():
    conn = get_test_connection()
    cursor = conn.cursor()
    cursor.execute('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password BLOB NOT NULL)')
    conn.commit()
    conn.close()

def test_hashing():
    print("--- Running Hashing Verification ---")
    password = "secure_password123"
    username = "testuser"
    
    # 1. Test Hashing (Registration)
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    
    print(f"Original Password: {password}")
    print(f"Hashed Password: {hashed}")
    
    if password.encode('utf-8') == hashed:
        print("FAILED: Password stored in plain text!")
        return False
    else:
        print("SUCCESS: Password is hashed.")

    # 2. Test Verification (Login)
    if bcrypt.checkpw(password.encode('utf-8'), hashed):
        print("SUCCESS: Correct password verified.")
    else:
        print("FAILED: Correct password failed verification.")
        return False

    # 3. Test Incorrect Password
    if not bcrypt.checkpw("wrong_password".encode('utf-8'), hashed):
        print("SUCCESS: Incorrect password rejected.")
    else:
        print("FAILED: Incorrect password accepted.")
        return False

    print("--- All Tests Passed ---")
    return True

if __name__ == "__main__":
    if os.path.exists(DB_NAME):
        os.remove(DB_NAME)
    setup_test_db()
    test_hashing()
    if os.path.exists(DB_NAME):
        os.remove(DB_NAME)
