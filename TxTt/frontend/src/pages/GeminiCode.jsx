import React, { useState, useRef } from 'react';
// You can install lucide-react for clean, tiny icons: npm install lucide-react
import { Paperclip, Camera, Mic, Square, X } from 'lucide-react'; 

export default function ChatInput({ onSendMessage }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // --- FEATURE 1: ATTACHMENT LOGIC ---
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setAttachments((prev) => [...prev, ...files]);
  };

  // --- FEATURE 2: CAMERA LOGIC ---
  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error("Error accessing webcam:", err);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
      const file = new File([blob], `photo_${Date.now()}.png`, { type: 'image/png' });
      setAttachments((prev) => [...prev, file]);
      closeCamera();
    }, 'image/png');
  };

  const closeCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    setShowCamera(false);
  };

  // --- FEATURE 3: AUDIO MESSAGE LOGIC ---
  const startRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
        
        // Directly send or add to attachments queue
        setAttachments((prev) => [...prev, audioFile]);
        stream.getTracks().forEach(track => track.stop()); // Turn off mic light
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="chat-input-container" style={{ padding: '10px', background: '#1e1e1e', color: '#fff' }}>
      
      {/* Tiny Previews above the input bar if files are selected */}
      {attachments.length > 0 && (
        <div className="preview-bar" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          {attachments.map((file, idx) => (
            <div key={idx} style={{ background: '#333', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
              📎 {file.name}
            </div>
          ))}
        </div>
      )}

      {/* Main Input Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        
        {/* Attachment Button */}
        <button onClick={() => fileInputRef.current.click()} title="Attach files" style={btnStyle}>
          <Paperclip size={18} />
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          multiple 
          style={{ display: 'none' }} 
        />

        {/* Camera Button */}
        <button onClick={startCamera} title="Take Picture" style={btnStyle}>
          <Camera size={18} />
        </button>

        {/* Microphone / Audio Message Button */}
        {isRecording ? (
          <button onClick={stopRecording} title="Stop Recording" style={{ ...btnStyle, color: 'red' }}>
            <Square size={18} />
          </button>
        ) : (
          <button onClick={startRecording} title="Record Audio Message" style={btnStyle}>
            <Mic size={18} />
          </button>
        )}

        {/* Text Field */}
        <input 
          type="text" 
          value={text} 
          onChange={(e) => setText(e.target.value)}
          placeholder={isRecording ? "Recording audio..." : "Type a message..."}
          disabled={isRecording}
          style={{ flexGrow: 1, padding: '8px', borderRadius: '4px', border: 'none', background: '#2d2d2d', color: '#fff' }}
        />
        
        <button style={{ padding: '8px 16px', background: '#007acc', color: '#fff', border: 'none', borderRadius: '4px' }}>
          Send
        </button>
      </div>

      {/* Camera Modal Popup */}
      {showCamera && (
        <div style={modalOverlayStyle}>
          <div style={modalStyle}>
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: '8px' }}></video>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
              <button onClick={closeCamera} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px' }}>Cancel</button>
              <button onClick={capturePhoto} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px' }}>Snap Photo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Quick Inline Styles for the demo layout
const btnStyle = { background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', padding: '5px' };
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalStyle = { background: '#222', padding: '20px', borderRadius: '8px', maxWidth: '400px', width: '90%' };