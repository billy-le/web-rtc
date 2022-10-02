"use strict";

// polyfill https://github.com/webrtc/adapter
import "./adapter.mjs";
import { getLocalStream } from "/media.js";
import { getScreenCastMedia } from "./stream.js";
import { stunServers } from "./stun-servers.js";
import { io } from "https://cdn.socket.io/4.4.1/socket.io.esm.min.js";
import dateFnsFormat from "https://cdn.jsdelivr.net/npm/date-fns@2.29.2/esm/format/index.js";
const socket = io();

let stream = null;
let screenCastId = null;
const USER_ID = Math.floor(Math.random() * (100_000 - 1) + 0);
const ROOM_MESSAGE = "room";
const MAX_STREAMERS = 4;
let facingMode = "user";
let peerConnections = new Map();

const [
  form,
  message,
  messages,
  localStreamVideo,
  buttonMic,
  buttonCamera,
  buttonHangup,
  buttonCopyLink,
  startStreamButton,
  streamsContainer,
  wrapContainer,
  remoteStreamsContainer,
  swapCamera,
  startScreenCastButton,
] = [
  "form",
  "message-input",
  "messages",
  "local-stream",
  "mic",
  "camera",
  "hangup",
  "copy-link",
  "start-stream",
  "streams",
  "wrap",
  "remote-streams",
  "swap-camera",
  "screen-cast",
].map((id) => document.querySelector(`#${id}`));

if (startScreenCastButton) {
  startScreenCastButton.addEventListener("pointerdown", async () => {
    const video = document.querySelector("#local-stream");
    if (startScreenCastButton.classList.contains("active")) {
      video.srcObject.getTracks().forEach((track) => {
        track.stop();
      });
      peerConnections.forEach((peerConnection) => {
        const senders = peerConnection.getSenders();
        for (const sender of senders) {
          if (sender.track?.id === screenCastId) {
            peerConnection.removeTrack(sender);
          }
        }
      });
      startScreenCastButton.classList.remove("active");
      screenCastId = null;
      video.srcObject = stream;
    } else {
      const screenCast = await getScreenCastMedia();
      startScreenCastButton.classList.add("active");
      if (screenCast) {
        if (video) {
          video.srcObject = screenCast;
        }
        screenCast.getVideoTracks().forEach((track) => {
          track.addEventListener("ended", async () => {
            peerConnections.forEach((peerConnection) => {
              const senders = peerConnection.getSenders();
              const sender = senders.find((sender) => sender.track?.id === track.id);
              if (sender) {
                peerConnection.removeTrack(sender);
              }
            });

            startScreenCastButton.classList.remove("active");
            screenCastId = null;
            video.srcObject = stream;
          });
          screenCastId = track.id;

          peerConnections.forEach((peerConnection) => {
            peerConnection.addTrack(track, screenCast);
          });
        });
      }
    }
  });
}

if (swapCamera) {
  swapCamera.addEventListener("pointerdown", async () => {
    facingMode = facingMode === "user" ? "environment" : "user";
    if (stream) {
      const camera = await window.navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
        },
      });

      camera.getVideoTracks().forEach((track) => {
        stream.addTrack(track);
      });
    }
  });
}

if (buttonMic) {
  buttonMic.addEventListener("pointerdown", () => {
    buttonMic.classList.toggle("active");
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
    }
  });
}

if (buttonCamera) {
  buttonCamera.addEventListener("pointerdown", () => {
    buttonCamera.classList.toggle("active");
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
    }
  });
}

if (buttonHangup) {
  buttonHangup.addEventListener("pointerdown", () => {
    buttonHangup.classList.add("active");
    buttonHangup.setAttribute("disabled", "true");

    const remoteStreamVideos = document.querySelectorAll("[data-remote-stream]");

    if (remoteStreamVideos) {
      remoteStreamVideos.forEach((element) => {
        element.srcObject.getTracks().forEach((track) => {
          track.stop();
        });
        element.classList.remove("active");
        element.remove();
      });
    }

    if (localStreamVideo) {
      localStreamVideo.classList.remove("active");
    }
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
        stream.removeTrack(track);
      });
      stream = null;
      startStreamButton.classList.remove("hidden");

      if (streamsContainer) {
        streamsContainer.classList.remove("open");
      }
      if (wrapContainer) {
        wrapContainer.classList.remove("stream-open");
      }
    }
    peerConnections.forEach((peerConnection) => {
      peerConnection.close();
    });

    peerConnections = new Map();

    socket.emit(ROOM_MESSAGE, { type: "leave-stream", roomId: ROOM_ID, userId: USER_ID });
  });
}

if (buttonCopyLink) {
  buttonCopyLink.addEventListener("pointerdown", async () => {
    if (window.navigator?.clipboard) {
      await window.navigator.clipboard.writeText(window.location.href);
    }
  });
}

if (startStreamButton) {
  startStreamButton.addEventListener("pointerdown", async () => {
    try {
      stream = await getLocalStream();

      startStreamButton.classList.add("hidden");

      if (streamsContainer) {
        streamsContainer.classList.add("open");
      }
      if (wrapContainer) {
        wrapContainer.classList.add("stream-open");
      }
      if (buttonHangup) {
        buttonHangup.classList.remove("active");
        buttonHangup.removeAttribute("disabled");
      }
      socket.emit(ROOM_MESSAGE, { type: "join-stream", roomId: ROOM_ID, userId: USER_ID });
    } catch (err) {
      alert("User must enable permissions to begin streaming");
    }
  });
}

function handleRemoveRemoteStream(remoteStreamId) {
  const remoteStreams = document.querySelectorAll("[data-remote-stream]");

  remoteStreams.forEach((element) => {
    if (element.dataset.remoteStream === remoteStreamId.toString()) {
      element.srcObject.getTracks().forEach((track) => {
        track.stop();
      });
      element.classList.remove("active");
      element.remove();
    }
  });

  if (remoteStreams.length === 1) {
    if (localStreamVideo) {
      localStreamVideo.classList.remove("active");
    }
    if (remoteStreamsContainer) {
      remoteStreamsContainer.classList.remove("active");
    }
  }
}

function toHTML(element) {
  const toHTML = document.createElement("span");
  toHTML.innerHTML = element;
  return toHTML.textContent;
}

function createMessage({ msg, userId }) {
  const li = document.createElement("li");

  const chatMessageContainer = document.createElement("div");
  chatMessageContainer.classList.add("chat-message");

  if (userId) {
    const isCurrentUser = userId === USER_ID;

    const messageContainer = document.createElement("div");
    messageContainer.classList.add("message-container");
    const message = document.createElement("p");
    message.classList.add("message");
    message.textContent = toHTML(msg);

    const date = document.createElement("div");
    date.classList.add("date");

    const currentTime = dateFnsFormat(new Date(), "hh:mm a");
    date.append(currentTime);

    messageContainer.append(date, message);

    const avatar = document.createElement("div");
    avatar.classList.add("avatar");

    if (isCurrentUser) {
      chatMessageContainer.classList.add("reverse");
      avatar.classList.add("current-user");
      avatar.textContent = "Me";
    } else {
      avatar.classList.add("user");
      avatar.textContent = toHTML(userId);
    }

    chatMessageContainer.append(avatar, messageContainer);
  } else {
    const systemMessage = document.createElement("p");
    systemMessage.classList.add("system-message");
    systemMessage.textContent = toHTML(msg);

    chatMessageContainer.append(systemMessage);
  }

  li.appendChild(chatMessageContainer);

  if (messages) {
    messages.appendChild(li);
    messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
  }
}

const createPeerConnection = (remoteUserId) => {
  const peerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: stunServers,
      },
    ],
  });

  if (stream) {
    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });
  }

  peerConnection.addEventListener("connectionstatechange", () => {
    if (peerConnection.connectionState === "connected" && buttonHangup) {
      buttonHangup.removeAttribute("disabled");
      buttonHangup.classList.remove("active");
    }
  });

  peerConnection.addEventListener("negotiationneeded", (event) => {
    createOffer(event.target);
  });

  peerConnection.addEventListener("track", (event) => {
    const remoteStream = new MediaStream();
    event.streams.forEach((stream) => {
      stream.getTracks().forEach((track) => {
        remoteStream.addTrack(track);

        if (track.kind.includes("video")) {
          const videoElement = document.querySelector(`[data-track-id="${track.id}"]`);

          if (!videoElement) {
            const remoteStreamVideo = document.createElement("video");
            remoteStreamVideo.setAttribute("data-remote-stream", remoteUserId);
            remoteStreamVideo.setAttribute("data-track-id", track.id);
            remoteStreamVideo.classList.add("active");

            if (remoteStreamsContainer) {
              remoteStreamsContainer.appendChild(remoteStreamVideo);
              remoteStreamsContainer.classList.add("active");
            }

            if (localStreamVideo) {
              localStreamVideo.classList.add("active");
            }

            if (remoteStreamVideo) {
              remoteStreamVideo.srcObject = remoteStream;
              remoteStreamVideo.play();
            }
          }
        }
      });

      stream.addEventListener('removetrack', (event) => {
        remoteStream.getTracks().forEach(track => {
          if(track.id === event.track.id) {
            const videoElement = document.querySelector(`[data-track-id="${track.id}"]`);
            videoElement.classList.remove("active");
            videoElement.srcObject.getTracks().forEach(track => track.stop());
            videoElement.remove()
          }
        })
      })
    });
  });

  peerConnection.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      socket.emit(ROOM_MESSAGE, {
        type: "ice-candidate",
        roomId: ROOM_ID,
        userId: USER_ID,
        candidate: event.candidate,
        targetId: remoteUserId,
      });
    }
  });

  return peerConnection;
};

const createOffer = async (peerConnection) => {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit(ROOM_MESSAGE, { type: "offer-sdp", roomId: ROOM_ID, userId: USER_ID, offer });
};

const receiveOffer = async (peerConnection, offer) => {
  await peerConnection.setRemoteDescription(offer);
};

const createAnswer = async (peerConnection, targetId) => {
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit(ROOM_MESSAGE, { type: "answer-sdp", roomId: ROOM_ID, userId: USER_ID, answer, targetId });
};

const receiveAnswer = async (peerConnection, answer) => {
  await peerConnection.setRemoteDescription(answer);
};

const addIceCandidate = async (peerConnection, candidate) => {
  peerConnection.addIceCandidate(candidate);
};

function toggleStreamButtonVisibility(streamers) {
  if (startStreamButton && !streamers?.includes(USER_ID)) {
    if (streamers?.length === MAX_STREAMERS) {
      startStreamButton.classList.add("hidden");
    } else if (streamers?.length && streamers.length < MAX_STREAMERS) {
      startStreamButton.classList.remove("hidden");
      startStreamButton.innerHTML = `Join Stream<i class="fa-solid fa-arrow-right-to-bracket"></i>`;
    } else {
      startStreamButton.classList.remove("hidden");
      startStreamButton.innerHTML = `<i class="fa-solid fa-video"></i>Start Stream`;
    }
  }
}

socket.on(ROOM_MESSAGE, async (data) => {
  try {
    const { type } = data;
    switch (type) {
      case "chat-message": {
        createMessage(data);
        break;
      }
      case "join-room": {
        createMessage({
          msg:
            data.userId === USER_ID
              ? `Welcome to Room "${ROOM_ID}". You are designated as User ${USER_ID}.`
              : `User ${data.userId} has joined.`,
        });
        break;
      }
      case "current-streamers": {
        const { streamers } = data;
        if (streamers?.length && data.userId === USER_ID) {
          const users = streamers.map((userId) => `User ${userId}`).join(", ");
          createMessage({
            msg: `${users} ${streamers.length > 1 ? "are" : "is"} currently streaming.`,
          });
        }
        toggleStreamButtonVisibility(streamers);
        break;
      }
      case "join-stream": {
        createMessage({
          msg: data.userId === USER_ID ? `You have joined the stream.` : `User ${data.userId} joined the stream.`,
        });
        break;
      }
      case "user-streamer": {
        const { streamers } = data;
        if (streamers?.includes(USER_ID) && !peerConnections.has(data.userId)) {
          const peerConnection = await createPeerConnection(data.userId);
          peerConnections.set(data.userId, peerConnection);
          await createOffer(peerConnection);
        }

        toggleStreamButtonVisibility(streamers);
        break;
      }
      case "leave-stream": {
        createMessage({
          msg: data.userId === USER_ID ? "You have left the stream" : `User ${data.userId} has left the stream.`,
        });
        const peerConnection = peerConnections.get(data.userId);
        if (peerConnection) {
          peerConnection.close();

          handleRemoveRemoteStream(data.userId);
        }

        peerConnections.delete(data.userId);
        toggleStreamButtonVisibility(data.streamers);
        break;
      }
      case "leave-room": {
        createMessage({ msg: `User ${data.userId} has left.` });
        const peerConnection = peerConnections.get(data.userId);
        if (peerConnection) {
          peerConnection.close();

          handleRemoveRemoteStream(data.userId);
        }

        peerConnections.delete(data.userId);
        toggleStreamButtonVisibility(data.streamers);
        break;
      }
      case "offer-sdp": {
        const { streamers } = data;
        if (streamers.includes(USER_ID)) {
          const peerConnection = peerConnections.get(data.userId);
          if (!peerConnection) {
            const newPeerConnection = await createPeerConnection(data.userId);
            peerConnections.set(data.userId, newPeerConnection);
            await receiveOffer(newPeerConnection, data.offer);
            await createAnswer(newPeerConnection, data.userId);
          } else {
            await receiveOffer(peerConnection, data.offer);
            await createAnswer(peerConnection, data.userId);
          }
        }
        break;
      }
      case "answer-sdp": {
        const { streamers } = data;
        if (streamers.includes(USER_ID) && USER_ID === data.targetId) {
          const peerConnection = peerConnections.get(data.userId);
          if (peerConnection) {
            await receiveAnswer(peerConnection, data.answer);
          }
        }
        break;
      }
      case "ice-candidate": {
        const { streamers } = data;
        if (streamers.includes(USER_ID) && USER_ID === data.targetId) {
          const peerConnection = peerConnections.get(data.userId);
          if (peerConnection) {
            await addIceCandidate(peerConnection, data.candidate);
          }
          break;
        }
      }
    }
  } catch (err) {
    console.log(err);
  }
});

if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (message?.value) {
      socket.emit(ROOM_MESSAGE, { type: "chat-message", roomId: ROOM_ID, userId: USER_ID, msg: message.value });
      message.value = "";
    }
  });
}

const init = () => {
  socket.emit(ROOM_MESSAGE, { type: "join-room", roomId: ROOM_ID, userId: USER_ID });
};

init();
