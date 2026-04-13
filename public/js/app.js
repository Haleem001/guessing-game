const joinForm = document.getElementById('join-form');
const roomIdInput = document.getElementById('roomId');
const generateRoomIdButton = document.getElementById('generate-room-id');

function generateRoomId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  for (let index = 0; index < 6; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    code += alphabet[randomIndex];
  }

  return code;
}

if (roomIdInput && !roomIdInput.value.trim()) {
  roomIdInput.value = generateRoomId();
}

if (generateRoomIdButton && roomIdInput) {
  generateRoomIdButton.addEventListener('click', () => {
    roomIdInput.value = generateRoomId();
    roomIdInput.focus();
    roomIdInput.select();
  });
}

if (joinForm) {
  joinForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const formData = new FormData(joinForm);
    const name = String(formData.get('name') || '').trim();
    const roomId = String(formData.get('roomId') || '').trim();

    if (!name || !roomId) {
      return;
    }

    const nextUrl = `/game/${encodeURIComponent(roomId)}?name=${encodeURIComponent(name)}`;
    window.location.href = nextUrl;
  });
}
