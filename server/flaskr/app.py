import os
import sys

# Add the parent directory to sys.path to resolve imports when running as a script
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import sqlite3
import bcrypt

from flask import Flask
from markupsafe import escape
from flask import url_for
from flask import request,jsonify,redirect
from flask import render_template
from flask import session

from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS

from setupDB import add_new_user
from setupDB import get_user

# Note: Eventlet/Gevent monkey patching is disabled to ensure compatibility 
# with Python 3.13 + Windows internals. The server will run in 'threading' mode.

app = Flask(__name__)
app.secret_key = 'super_secret_key_change_this_later'
CORS(app)

# Explicitly using async_mode='threading' for compatibility with Python 3.13
# manage_session=False fixes "AttributeError: property 'session' of 'RequestContext' object has no setter" in newer Flask versions
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading', manage_session=False, logger=True, engineio_logger=True)

users = {} # {socket_id: username}


@app.route("/")
def homepage():
	return render_template("index.html")

@app.route("/register", methods = ['GET', 'POST'])
def register():
    if request.method == 'POST':
        return do_the_register()
    else:
        return show_the_register_form()

def show_the_register_form():
    return render_template("auth/register.html")

def do_the_register():
    #unpacks json data sent from js
    data = request.get_json()

    #extracts specific variables 
    uName = data.get('username')
    passW = data.get('password')

    is_successful = add_new_user(uName, passW)

    if(is_successful == True):
        return jsonify({"status": "successful", "message": f"Registration received for {uName}.. redirecting to login page"})
    elif (is_successful == False):
        return jsonify({"status": "unsuccessful", "message": f"Registration was not received for {uName} due to an error, the username is already taken"})
    #sends result data to the browser through JSON
  

@app.route('/login', methods = ['GET', 'POST'])
def login():
    if request.method == 'POST':
        return do_the_login()
    else:
        return show_the_login_form()

def show_the_login_form():
	return render_template("auth/login.html")

def do_the_login():
    data = request.get_json()

    uName = data.get('username')
    passW = data.get('password')

    user_row = get_user(uName) # Pass the username here!

    #if the returned tuple is empty
    if (user_row is None):
        return jsonify({"status": "unsuccessful", "message": "Login unsuccessful, username not found"})
    
    #If they exist, check the password (stored at index 2)
    hashed_db_password = user_row[2]

    if (bcrypt.checkpw(passW.encode('utf-8'), hashed_db_password)):
        #saves the name in the cookie
        session['logged_in_user'] = uName
        return jsonify({"status": "successful", "message": "Login successful"})
    else:
        return jsonify({"status": "unsuccessful", "message": "Login unsuccessful, password not correct"})

@app.route("/user/<username>")
def profile(username):
    #check if the cookie exists and matches the URL
    if 'logged_in_user' not in session or session['logged_in_user'] != username:
        return "Access Denied: you must be logged in as a user to view this page"

    user_data = get_user(username)
    return render_template("profile.html", user=user_data)

@app.route("/logout")
def logout():
    session.pop('logged_in_user', None)
    return redirect(url_for('homepage'))

@socketio.on('connect')
def handle_connect():
    print(f"[CONNECT] ID: {request.sid} | IP: {request.remote_addr}")

@socketio.on('join')
def handle_join(username):
    users[request.sid] = username
    print(f"[JOIN] {username} (ID: {request.sid})")
    emit('user-list', [{"id": sid, "name": name} for sid, name in users.items()], broadcast=True)

@socketio.on('offer')
def handle_offer(data):
    target_to = data.get('to')
    sender_name = users.get(request.sid)
    print(f"[OFFER] from {sender_name} to {target_to}")
    emit('offer', {
        'from': request.sid,
        'fromName': sender_name,
        'offer': data.get('offer'),
        'isVideo': data.get('isVideo')
    }, to=target_to)

@socketio.on('answer')
def handle_answer(data):
    emit('answer', {'from': request.sid, 'answer': data.get('answer')}, to=data.get('to'))

@socketio.on('ice-candidate')
def handle_ice_candidate(data):
    emit('ice-candidate', {'from': request.sid, 'candidate': data.get('candidate')}, to=data.get('to'))

@socketio.on('call-rejected')
def handle_call_rejected(data):
    emit('call-rejected', {'from': request.sid}, to=data.get('to'))

@socketio.on('end-call')
def handle_end_call(data):
    emit('end-call', {'from': request.sid}, to=data.get('to'))

@socketio.on('disconnect')
def handle_disconnect():
    username = users.pop(request.sid, 'unknown')
    print(f"[DISCONNECT] ID: {request.sid} ({username})")
    emit('user-list', [{"id": sid, "name": name} for sid, name in users.items()], broadcast=True)

if __name__ == "__main__":
    # Standard socketio.run handles WebSocket upgrades even in threading mode
    socketio.run(app, host='0.0.0.0', port=3000, debug=True)