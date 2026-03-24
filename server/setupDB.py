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
		password TEXT NOT NULL,
		age INTEGER,
		subscription_status TEXT,
		is_voip_eligible BOOLEAN DEFAULT 0,
		is_head_of_household BOOLEAN DEFAULT 0,
		household_id TEXT,
		profile_image TEXT
		)
''')

dbConn.commit()
dbConn.close()

def add_new_user(username, password, age=None, sub_status=None, is_eligible=0, is_hoh=0, household_id=None):
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Check if HoH already exists for this household
        if is_hoh and household_id:
            cursor.execute('SELECT id FROM users WHERE household_id = ? AND is_head_of_household = 1', (household_id,))
            if cursor.fetchone():
                return "HOH_EXISTS"

        # Hash the password
        salt = bcrypt.gensalt()
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), salt)
        
        # Execute the insertion
        cursor.execute('''
            INSERT INTO users (username, password, age, subscription_status, is_voip_eligible, is_head_of_household, household_id) 
            VALUES (?,?,?,?,?,?,?)
        ''', (username, hashed_password, age, sub_status, is_eligible, is_hoh, household_id))
        conn.commit()
        return True #successfully added a user
    except sqlite3.IntegrityError:
    	# The UNIQUE constraint failed, meaning the username is taken, therefore IntegrityError will be thrown
    	return False #failed adding a user
    finally:
    	conn.close()

def get_user(username):
	conn = get_connection()
	cursor = conn.cursor()

	cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
	user_row = cursor.fetchone()
	
	conn.close()
	return user_row

def update_profile_image(username, image_path):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET profile_image = ? WHERE username = ?', (image_path, username))
    conn.commit()
    conn.close()
