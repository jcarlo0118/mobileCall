import sqlite3
import bcrypt

#establishes a connection to the database
def get_connection():
	return sqlite3.connect('userDatabase.db')

dbConn = get_connection()

cursor = dbConn.cursor()

cursor.execute(''' 
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL
		)
''')

dbConn.commit()
dbConn.close()

def add_new_user(username, password):
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Hash the password
        salt = bcrypt.gensalt()
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), salt)
        
        # Execute the insertion
        cursor.execute('INSERT INTO users (username, password) VALUES (?,?)', (username, hashed_password))
        conn.commit()
        return True #successfully added a user
    except sqlite3.IntegrityError:
    	# The UNIQUE constraint failed, meaning the username is taken, therefore IntegrityError will be thrown
    	return False #failed adding a user

    	#always closes the connection
    finally:
    	conn.close()

def get_user(username):
	conn = get_connection()
	cursor = conn.cursor()

	cursor.execute('SELECT * FROM users WHERE username = ?', (username,))

	#fetchone() returns a tuple where the data appears in the order the columns were defined in your CREATE TABLE command: (id, username, password)
	user_row = cursor.fetchone()
	
	conn.close()
	return user_row
