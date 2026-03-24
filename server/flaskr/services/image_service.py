import cv2
import os
import numpy as np

class ImageProcessingService:
    def __init__(self, cascade_path=None):
        if cascade_path is None:
            # Use default Haar Cascade for face detection
            self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        else:
            self.face_cascade = cv2.CascadeClassifier(cascade_path)

    def detect_faces(self, image_path):
        """
        Detects faces in an image and returns their coordinates.
        """
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError("Could not read image")
            
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(gray, 1.1, 4)
        
        # Convert to list of dicts for JSON serialization
        face_list = []
        for (x, y, w, h) in faces:
            face_list.append({
                'x': int(x),
                'y': int(y),
                'w': int(w),
                'h': int(h)
            })
            
        return face_list, img.shape

    def crop_face(self, image_path, x, y, w, h, output_path):
        """
        Crops the image to the specified face and saves it.
        """
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError("Could not read image")
            
        # Add some padding to the crop
        height, width = img.shape[:2]
        pad_x = int(w * 0.2)
        pad_y = int(h * 0.2)
        
        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(width, x + w + pad_x)
        y2 = min(height, y + h + pad_y)
        
        face_img = img[y1:y2, x1:x2]
        cv2.imwrite(output_path, face_img)
        return output_path
