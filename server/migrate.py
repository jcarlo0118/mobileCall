import sqlite3

def migrate():
    conn = sqlite3.connect('c:\\Users\\panta_6nrhswo\\Documents\\mobileCall\\server\\userDatabase.db')
    cursor = conn.cursor()
    
    columns = [
        ('age', 'INTEGER'),
        ('subscription_status', 'TEXT'),
        ('is_voip_eligible', 'BOOLEAN DEFAULT 0'),
        ('is_head_of_household', 'BOOLEAN DEFAULT 0'),
        ('household_id', 'TEXT'),
        ('profile_image', 'TEXT')
    ]
    
    for col_name, col_type in columns:
        try:
            cursor.execute(f'ALTER TABLE users ADD COLUMN {col_name} {col_type}')
            print(f"Added column {col_name}")
        except sqlite3.OperationalError:
            print(f"Column {col_name} already exists")
            
    conn.commit()
    conn.close()

if __name__ == "__main__":
    migrate()
