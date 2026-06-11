// Micro:bit Bluetooth UART Service UUID
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";

// Bluetooth state
let bluetoothDevice = null;
let uartCharacteristic = null; // 실제 쓰기 가능한 특성 (자동 탐색)
let useWriteWithResponse = true; // 쓰기 방식 플래그
let isConnected = false;

// Default Commands (마이크로비트 코드에 맞춤)
const defaultCommands = {
    up: "UP",
    down: "DOWN",
    left: "LEFT",
    right: "RIGHT",
    a: "A",
    b: "B",
    c: "C",
    d: "D",
    stop: "STOP"
};

// Default Tuning Variables
const defaultTuning = {
    F_P0: 180,
    F_P1: 0,
    B_P0: 0,
    B_P1: 180,
    L_P0: 0,
    L_P1: 0,
    R_P0: 180,
    R_P1: 180,
    A_P2: 180,
    B_P2: 0,
    C_P2: 90,
    D_P2: 90
};

// Current Commands and Tuning Variables
let currentCommands = { ...defaultCommands };
let currentTuning = { ...defaultTuning };

// DOM Elements
const btnConnect = document.getElementById('btn-connect');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');

const modal = document.getElementById('settings-modal');
const btnSettings = document.getElementById('btn-settings');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnOption = document.getElementById('btn-option');
const btnSaveSettings = document.getElementById('btn-save-settings');
const toast = document.getElementById('toast');

// Tuning Elements
const tuningModal = document.getElementById('tuning-modal');
const btnCloseTuning = document.getElementById('btn-close-tuning');
const motorSliders = document.querySelectorAll('.motor-slider');

// Control Buttons
const ctrlBtns = document.querySelectorAll('.ctrl-btn');

// Initialize
function init() {
    loadSettings();
    setupEventListeners();
}

// Load Settings from LocalStorage
function loadSettings() {
    const saved = localStorage.getItem('microbit-car-commands-v5');
    if (saved) {
        currentCommands = { ...defaultCommands, ...JSON.parse(saved) };
    }

    const savedTuning = localStorage.getItem('microbit-car-tuning-v1');
    if (savedTuning) {
        currentTuning = { ...defaultTuning, ...JSON.parse(savedTuning) };
    }

    // Populate Modal Inputs
    document.getElementById('cmd-up').value = currentCommands.up;
    document.getElementById('cmd-down').value = currentCommands.down;
    document.getElementById('cmd-left').value = currentCommands.left;
    document.getElementById('cmd-right').value = currentCommands.right;
    document.getElementById('cmd-a').value = currentCommands.a;
    document.getElementById('cmd-b').value = currentCommands.b;
    document.getElementById('cmd-c').value = currentCommands.c;
    document.getElementById('cmd-d').value = currentCommands.d;
    document.getElementById('cmd-stop').value = currentCommands.stop;

    // Populate Tuning Sliders
    motorSliders.forEach(slider => {
        const varName = slider.getAttribute('data-var');
        if (currentTuning[varName] !== undefined) {
            slider.value = currentTuning[varName];
            document.getElementById('val_' + slider.id.replace('var_', '')).innerText = currentTuning[varName];
        }
    });
}

// Save Settings to LocalStorage
function saveSettings() {
    currentCommands.up = document.getElementById('cmd-up').value || "UP";
    currentCommands.down = document.getElementById('cmd-down').value || "DOWN";
    currentCommands.left = document.getElementById('cmd-left').value || "LEFT";
    currentCommands.right = document.getElementById('cmd-right').value || "RIGHT";
    currentCommands.a = document.getElementById('cmd-a').value || "A";
    currentCommands.b = document.getElementById('cmd-b').value || "B";
    currentCommands.c = document.getElementById('cmd-c').value || "C";
    currentCommands.d = document.getElementById('cmd-d').value || "D";
    currentCommands.stop = document.getElementById('cmd-stop').value || "STOP";

    localStorage.setItem('microbit-car-commands-v5', JSON.stringify(currentCommands));

    // Hide modal and show toast
    modal.classList.remove('show');
    showToast();
}

function showToast() {
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// Setup all Event Listeners
function setupEventListeners() {
    // Settings Modal
    btnSettings.addEventListener('click', () => modal.classList.add('show'));
    btnCloseModal.addEventListener('click', () => modal.classList.remove('show'));
    btnSaveSettings.addEventListener('click', saveSettings);

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
    });

    // Tuning Modal
    btnOption.addEventListener('click', () => tuningModal.classList.add('show'));
    btnCloseTuning.addEventListener('click', () => tuningModal.classList.remove('show'));

    // Close tuning modal when clicking outside
    tuningModal.addEventListener('click', (e) => {
        if (e.target === tuningModal) tuningModal.classList.remove('show');
    });

    // Tuning Sliders
    motorSliders.forEach(slider => {
        // Update text value instantly
        slider.addEventListener('input', (e) => {
            document.getElementById('val_' + slider.id.replace('var_', '')).innerText = e.target.value;
        });

        // Save and send variable on change (mouse up/touch end)
        slider.addEventListener('change', (e) => {
            const varName = e.target.getAttribute('data-var');
            const val = e.target.value;
            currentTuning[varName] = val;
            localStorage.setItem('microbit-car-tuning-v1', JSON.stringify(currentTuning));

            // Send to micro:bit: VAR:F_P0:180
            sendData(`VAR:${varName}:${val}`);
        });
    });

    // Bluetooth Connect
    btnConnect.addEventListener('click', toggleBluetooth);

    // Control Buttons (Mouse & Touch)
    ctrlBtns.forEach(btn => {
        // Press -> Send Action
        btn.addEventListener('mousedown', handlePress);
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            handlePress(e);
        }, { passive: false });

        // Release -> Send Stop
        btn.addEventListener('mouseup', handleRelease);
        btn.addEventListener('mouseleave', handleRelease);
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            handleRelease(e);
        }, { passive: false });
    });
}

// Control Logic
let currentActiveCommand = null;

function handlePress(e) {
    const btn = e.currentTarget;
    const action = btn.getAttribute('data-action');
    const commandToSend = currentCommands[action];

    btn.classList.add('active');

    if (currentActiveCommand !== commandToSend) {
        currentActiveCommand = commandToSend;
        sendData(commandToSend);
    }
}

function handleRelease(e) {
    const btn = e.currentTarget;
    btn.classList.remove('active');

    // Check if any other buttons are still active
    const anyActive = Array.from(ctrlBtns).some(b => b.classList.contains('active'));

    if (!anyActive && currentActiveCommand !== currentCommands.stop) {
        currentActiveCommand = currentCommands.stop;
        sendData(currentCommands.stop);
    }
}

// Bluetooth Logic
async function toggleBluetooth() {
    if (isConnected) {
        disconnect();
    } else {
        await connect();
    }
}

async function connect() {
    try {
        if (!navigator.bluetooth) {
            alert('Web Bluetooth API is not available in this browser. Please use Chrome or Edge.');
            return;
        }

        statusText.innerText = '🔍 Connecting...';

        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'BBC micro:bit' }],
            optionalServices: [UART_SERVICE_UUID]
        });

        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

        const server = await bluetoothDevice.gatt.connect();
        statusText.innerText = '🔍 Finding UART...';

        const service = await server.getPrimaryService(UART_SERVICE_UUID);

        // ★ 모든 특성을 탐색하고 속성을 상세히 로그
        const characteristics = await service.getCharacteristics();

        uartCharacteristic = null;

        for (const char of characteristics) {
            const p = char.properties;
            const shortId = char.uuid.substring(4, 8);

            // 쓰기 가능한 특성 찾기
            if (!uartCharacteristic && (p.write || p.writeWithoutResponse)) {
                // ★ 실제로 쓰기 테스트를 해서 동작하는 것을 선택
                // writeValueWithResponse를 우선 시도 (더 안정적)
                if (p.write) {
                    try {
                        const testPayload = new TextEncoder().encode("\n");
                        await char.writeValueWithResponse(testPayload);
                        uartCharacteristic = char;
                        useWriteWithResponse = true;
                        continue;
                    } catch (e) {
                        console.log(`[${shortId}] writeWithResponse 실패: ${e.message}`);
                    }
                }
                if (p.writeWithoutResponse) {
                    try {
                        const testPayload = new TextEncoder().encode("\n");
                        await char.writeValueWithoutResponse(testPayload);
                        uartCharacteristic = char;
                        useWriteWithResponse = false;
                        continue;
                    } catch (e) {
                        console.log(`[${shortId}] writeWithoutResponse 실패: ${e.message}`);
                    }
                }
            }
        }

        if (!uartCharacteristic) {
            throw new Error("쓰기 가능한 특성을 찾지 못했습니다.");
        }

        const selectedId = uartCharacteristic.uuid.substring(4, 8);
        const writeMethod = useWriteWithResponse ? 'writeWithResponse' : 'writeWithoutResponse';

        isConnected = true;
        updateUIConnected();
        statusText.innerText = `✅ Connected [${selectedId}]`;

    } catch (error) {
        console.error(error);
        statusText.innerText = `❌ ${error.message}`;
        isConnected = false;
        updateUIDisconnected();
    }
}

function disconnect() {
    if (!bluetoothDevice || !bluetoothDevice.gatt.connected) return;
    bluetoothDevice.gatt.disconnect();
}

function onDisconnected() {
    isConnected = false;
    uartCharacteristic = null;
    updateUIDisconnected();
}

function updateUIConnected() {
    btnConnect.innerHTML = '<i class="fa-brands fa-bluetooth-b"></i> <span>Disconnect</span>';
    btnConnect.classList.add('connected');
    statusIndicator.classList.add('connected');
}

function updateUIDisconnected() {
    btnConnect.innerHTML = '<i class="fa-brands fa-bluetooth-b"></i> <span>Connect</span>';
    btnConnect.classList.remove('connected');
    statusIndicator.classList.remove('connected');
    statusText.innerText = 'Disconnected';
}

// ★ Send Data - 자동 탐색된 특성에 전송
async function sendData(data) {
    if (!isConnected || !uartCharacteristic) {
        statusText.innerText = '⚠️ Not connected';
        return;
    }

    const encoder = new TextEncoder();
    const payload = encoder.encode(data + "\n");

    try {
        if (useWriteWithResponse) {
            await uartCharacteristic.writeValueWithResponse(payload);
        } else {
            await uartCharacteristic.writeValueWithoutResponse(payload);
        }
        statusText.innerText = `📤 "${data}" → ✅`;
    } catch (err) {
        statusText.innerText = `📤 "${data}" → ❌ ${err.message}`;
    }
}

// Start app
init();

// ==========================================
// Firmware Download & Guide Logic
// ==========================================
const btnFlash = document.getElementById('btn-flash');
const flashModal = document.getElementById('flash-modal');
const btnCloseFlashModal = document.getElementById('btn-close-flash-modal');

if (btnFlash) {
    btnFlash.addEventListener('click', async () => {
        try {
            // 펌웨어 파일 가져오기 (원본 펌웨어 파일 사용)
            const response = await fetch('firmware.hex');
            const blob = await response.blob();

            if (window.showSaveFilePicker) {
                // 모던 브라우저 (Chrome, Edge 등): '다른 이름으로 저장' 창 띄우기
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'microbit_controller.hex',
                    types: [{
                        description: 'Micro:bit Hex File',
                        accept: { 'application/octet-stream': ['.hex'] },
                    }],
                });
                
                // 사용자가 선택한 경로(MICROBIT 드라이브)에 직접 파일 쓰기
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                alert('🎉 마이크로비트에 성공적으로 파일이 복사되었습니다!\n마이크로비트 뒷면의 노란 불빛 깜빡임이 멈추면 연결을 진행해주세요.');
                
            } else {
                // 구형 브라우저(Safari 등) fallback: 기존 다운로드 방식
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'microbit_controller.hex';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                // 직접 복사하라는 가이드 팝업 띄우기
                flashModal.classList.add('show');
            }
        } catch (error) {
            // 사용자가 저장 창에서 '취소'를 누른 경우는 에러로 처리하지 않음
            if (error.name !== 'AbortError') {
                console.error('Download failed:', error);
                alert('파일 저장 중 문제가 발생했습니다.');
            }
        }
    });

    btnCloseFlashModal.addEventListener('click', () => {
        flashModal.classList.remove('show');
    });
}
