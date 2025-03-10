const socket = io('https://omb-5yvy.onrender.com'); // Replace with your backend URL

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const disconnectButton = document.getElementById('disconnectButton');

let peerConnection;
let localStream;
let isCaller = false; // Track if this peer is the caller

// Get user media
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then((stream) => {
        localVideo.srcObject = stream;
        localStream = stream;

        // Handle pairing after localStream is available
        socket.on('paired', (partnerId) => {
            console.log('Paired with:', partnerId);
            createPeerConnection(partnerId);

            // Only the caller creates an offer
            if (!isCaller) {
                isCaller = true;
                createOffer(partnerId);
            }
        });
    })
    .catch((error) => {
        console.error('Error accessing media devices:', error);
        alert('Please allow access to your camera and microphone to use this app.');
    });

// Create peer connection
function createPeerConnection(partnerId) {
    peerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' } // Free STUN server
        ]
    });

    // Add local stream to peer connection
    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { to: partnerId, signal: { type: 'candidate', candidate: event.candidate } });
        }
    };
}

// Create and send offer
function createOffer(partnerId) {
    peerConnection.createOffer()
        .then((offer) => peerConnection.setLocalDescription(offer))
        .then(() => {
            socket.emit('signal', { to: partnerId, signal: { type: 'offer', offer: peerConnection.localDescription } });
        })
        .catch((error) => {
            console.error('Error creating offer:', error);
        });
}

// Handle signaling messages
socket.on('signal', (data) => {
    if (data.signal.type === 'offer') {
        if (peerConnection.signalingState !== 'stable') {
            console.warn('Signaling state is not stable, retrying in 500ms...');
            setTimeout(() => socket.emit('signal', data), 500); // Delay offer handling
            return;
        }
        peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal.offer))
            .then(() => peerConnection.createAnswer())
            .then((answer) => peerConnection.setLocalDescription(answer))
            .then(() => {
                socket.emit('signal', { to: data.from, signal: { type: 'answer', answer: peerConnection.localDescription } });
            })
            .catch((error) => {
                console.error('Error handling offer:', error);
            });
    } else if (data.signal.type === 'answer') {
        if (peerConnection.signalingState !== 'have-local-offer') {
            console.warn('Cannot handle answer: Signaling state is not have-local-offer');
            return;
        }
        peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal.answer))
            .catch((error) => {
                console.error('Error handling answer:', error);
            });
    } else if (data.signal.type === 'candidate') {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.signal.candidate))
            .catch((error) => {
                console.error('Error adding ICE candidate:', error);
            });
    }
});

// Handle disconnect
disconnectButton.addEventListener('click', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    socket.emit('user_disconnect'); // Use a custom event name
});