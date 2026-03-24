import sqlite3
conn = sqlite3.connect('userDatabase.db')
conn.row_factory = sqlite3.Row
r = conn.execute('SELECT * FROM users WHERE username="testuser123"').fetchone()
if r:
    print(dict(r))
else:
    print("User not found")
r2 = conn.execute('SELECT * FROM families').fetchall()
print(f"Families: {[dict(row) for row in r2]}")
conn.close()
