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
from werkzeug.utils import secure_filename

from setupDB import add_new_user, get_user, update_profile_image
from flaskr.services.eligibility_service import EligibilityService
from flaskr.services.image_service import ImageProcessingService

# Note: Eventlet/Gevent monkey patching is disabled to ensure compatibility 
# with Python 3.13 + Windows internals. The server will run in 'threading' mode.

app = Flask(__name__)
app.secret_key = 'super_secret_key_change_this_later'
CORS(app)

# Configure upload folder
UPLOAD_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), 'static', 'uploads'))
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Explicitly using async_mode='threading' for compatibility with Python 3.13
# manage_session=False fixes "AttributeError: property 'session' of 'RequestContext' object has no setter" in newer Flask versions
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading', manage_session=False, logger=True, engineio_logger=True)

users = {} # {socket_id: username}
image_processor = ImageProcessingService()

@app.route("/")
def homepage():
	return render_template("index.html")

@app.route("/register", methods = ['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({"status": "unsuccessful", "message": "Invalid JSON data"}), 400

    uName = data.get('username')
    passW = data.get('password')
    age = data.get('age')
    sub_status = data.get('subscription_status', 'basic')
    is_hoh = data.get('is_head_of_household', False)
    household_id = data.get('household_id')

    if not uName or not passW:
        return jsonify({"status": "unsuccessful", "message": "Username and password required"}), 400

    # Calculate eligibility
    is_eligible = EligibilityService.is_eligible(age, sub_status)

    is_successful = add_new_user(uName, passW, age, sub_status, is_eligible, is_hoh, household_id)

    if is_successful == True:
        return jsonify({
            "status": "successful", 
            "message": f"Registration received for {uName}",
            "is_voip_eligible": is_eligible
        })
    elif is_successful == "HOH_EXISTS":
        return jsonify({"status": "unsuccessful", "message": f"A head of household already exists for household {household_id}"}), 409
    else:
        return jsonify({"status": "unsuccessful", "message": f"Registration failed, username {uName} may be taken"}), 400

@app.route('/login', methods = ['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"status": "unsuccessful", "message": "Invalid JSON data"}), 400

    uName = data.get('username')
    passW = data.get('password')

    user_row = get_user(uName)

    if user_row is None:
        return jsonify({"status": "unsuccessful", "message": "Login unsuccessful, username not found"}), 404
    
    hashed_db_password = user_row[2]

    if bcrypt.checkpw(passW.encode('utf-8'), hashed_db_password):
        session['logged_in_user'] = uName
        # Return user data including eligibility
        # User row indices: 0:id, 1:username, 2:password, 3:age, 4:sub_status, 5:is_voip_eligible, 6:is_hoh, 7:household_id, 8:profile_image
        return jsonify({
            "status": "successful", 
            "message": "Login successful",
            "user": {
                "username": user_row[1],
                "is_voip_eligible": bool(user_row[5]),
                "is_head_of_household": bool(user_row[6]),
                "household_id": user_row[7]
            }
        })
    else:
        return jsonify({"status": "unsuccessful", "message": "Login unsuccessful, password not correct"}), 401

@app.route("/upload-image", methods=['POST'])
def upload_image():
    if 'image' not in request.files:
        return jsonify({"status": "unsuccessful", "message": "No image part"}), 400
    
    file = request.files['image']
    username = request.form.get('username')
    
    if file.filename == '' or not username:
        return jsonify({"status": "unsuccessful", "message": "No selected file or username"}), 400

    filename = secure_filename(f"{username}_group_{file.filename}")
    temp_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(temp_path)

    try:
        faces, img_shape = image_processor.detect_faces(temp_path)
        return jsonify({
            "status": "successful",
            "message": f"Detected {len(faces)} faces",
            "faces": faces,
            "image_id": filename
        })
    except Exception as e:
        return jsonify({"status": "unsuccessful", "message": str(e)}), 500

@app.route("/finalize-crop", methods=['POST'])
def finalize_crop():
    data = request.get_json()
    username = data.get('username')
    image_id = data.get('image_id')
    face_coords = data.get('face') # {x, y, w, h}

    if not username or not image_id or not face_coords:
        return jsonify({"status": "unsuccessful", "message": "Missing data"}), 400

    input_path = os.path.join(app.config['UPLOAD_FOLDER'], image_id)
    output_filename = f"{username}_profile.jpg"
    output_path = os.path.join(app.config['UPLOAD_FOLDER'], output_filename)

    try:
        image_processor.crop_face(
            input_path, 
            face_coords['x'], 
            face_coords['y'], 
            face_coords['w'], 
            face_coords['h'], 
            output_path
        )
        # Update database
        update_profile_image(username, f"/static/uploads/{output_filename}")
        return jsonify({
            "status": "successful",
            "message": "Profile image updated",
            "profile_image": f"/static/uploads/{output_filename}"
        })
    except Exception as e:
        return jsonify({"status": "unsuccessful", "message": str(e)}), 500

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