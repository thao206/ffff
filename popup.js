/**
 * popup.js - Giải pháp tăng cường cho extension giải bài tập LMS-ICTU.
 */

// Khai báo biến và cache DOM
let lastAnswer = null;  
let isProcessing = false;
let autoFillEnabled = false;
let autoSubmitEnabled = false;
let userName = '';
// Cải thiện bảo mật cho API key bằng cách mã hóa đơn giản
const encodedApiKey = btoa("AIzaSyB1l_-9hjEHjWpTGZkhIQMf8W6Y81Cbvjw".split('').reverse().join(''));

// Cache DOM elements để tránh truy vấn nhiều lần
const dom = {
    resultDiv: document.getElementById('result'),
    historyItems: document.getElementById('historyItems'),
    autoSolveBtn: document.getElementById('autoSolveBtn'),
    autoFillToggle: document.getElementById('autoFillToggle'),
    autoSubmitToggle: document.getElementById('autoSubmitToggle'),
    copyBtn: document.getElementById('copyBtn'),
    shareBtn: document.getElementById('shareBtn'),
    historyHeader: document.getElementById('historyHeader'),
    historyContent: document.getElementById('historyContent'),
    userName: document.getElementById('userName'),
    solvedCount: document.getElementById('solvedCount'),
    averageTime: document.getElementById('averageTime'),
    accuracy: document.getElementById('accuracy'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    errorMessage: document.getElementById('error-message')
};

// Lắng nghe tin nhắn từ script nền
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "triggerSolve") {
        solveQuestion();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    
    // Đăng ký các event listener
    if (dom.autoSolveBtn) dom.autoSolveBtn.addEventListener('click', solveQuestion);
    if (dom.autoFillToggle) dom.autoFillToggle.addEventListener('change', handleAutoFillToggle);
    if (dom.autoSubmitToggle) dom.autoSubmitToggle.addEventListener('change', handleAutoSubmitToggle);
    if (dom.copyBtn) dom.copyBtn.addEventListener('click', copyAnswerToClipboard);
    if (dom.shareBtn) dom.shareBtn.addEventListener('click', shareAnswer);
    if (dom.historyHeader) dom.historyHeader.addEventListener('click', toggleHistory);
    
    // Event listeners cho các button ở footer
    const settingsBtn = document.getElementById('settingsBtn');
    const helpBtn = document.getElementById('helpBtn');
    const reportBtn = document.getElementById('reportBtn');
    
    if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
    if (helpBtn) helpBtn.addEventListener('click', showHelpInfo);
    if (reportBtn) reportBtn.addEventListener('click', showReportForm);
    
    // Event listeners cho modal
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);
    
    const closeModalBtns = document.querySelectorAll('.close-modal');
    if (closeModalBtns) {
        closeModalBtns.forEach(btn => {
            btn.addEventListener('click', closeModal);
        });
    }
});

// Khởi tạo ứng dụng
async function initializeApp() {
    try {
        // Tải cài đặt từ storage
        await loadUserData();
        
        // Cập nhật giao diện người dùng
        updateUserInterface();
        
        // Tải và hiển thị tên người dùng
        userName = await fetchUserName();
        if (userName && dom.userName) {
            dom.userName.textContent = userName;
            chrome.storage.local.set({ userName });
        } else if (dom.userName) {
            dom.userName.textContent = "Người dùng";
        }
        
        // Tải thống kê
        loadStatistics();
    } catch (error) {
        console.error("Lỗi khởi tạo:", error);
        showError("Có lỗi khi khởi tạo ứng dụng. Vui lòng làm mới trang.");
    }
}

// Tải dữ liệu từ bộ nhớ local
async function loadUserData() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['lastAnswer', 'autoFillEnabled', 'autoSubmitEnabled', 'userName', 'settings'], (result) => {
            if (result.lastAnswer) {
                lastAnswer = result.lastAnswer;
            }
            
            if (result.autoFillEnabled !== undefined) {
                autoFillEnabled = result.autoFillEnabled;
                if (dom.autoFillToggle) dom.autoFillToggle.checked = autoFillEnabled;
            }
            
            if (result.autoSubmitEnabled !== undefined) {
                autoSubmitEnabled = result.autoSubmitEnabled;
                if (dom.autoSubmitToggle) dom.autoSubmitToggle.checked = autoSubmitEnabled;
            }
            
            if (result.userName) {
                userName = result.userName;
            }
            
            // Tải cài đặt khác nếu có
            if (result.settings) {
                applySettings(result.settings);
            }
            
            resolve();
        });
    });
}

function applySettings(settings) {
    // Áp dụng chế độ tối nếu được bật
    if (settings.darkMode) {
        document.body.classList.add('dark-mode');
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) darkModeToggle.checked = true;
    }
    
    // Áp dụng cỡ chữ
    if (settings.fontSize) {
        document.body.classList.remove('font-small', 'font-medium', 'font-large');
        document.body.classList.add(`font-${settings.fontSize}`);
        const fontSizeSelect = document.getElementById('fontSizeSelect');
        if (fontSizeSelect) fontSizeSelect.value = settings.fontSize;
    }
    
    // Áp dụng API key tùy chỉnh nếu có
    if (settings.apiKey) {
        const apiKeyInput = document.getElementById('apiKeyInput');
        if (apiKeyInput) apiKeyInput.value = settings.apiKey;
    }
    
    // Áp dụng cài đặt tự động lưu
    if (settings.autoSave !== undefined) {
        const autoSaveToggle = document.getElementById('autoSaveToggle');
        if (autoSaveToggle) autoSaveToggle.checked = settings.autoSave;
    }
}

function updateUserInterface() {
    // Hiển thị kết quả cuối cùng nếu có
    if (lastAnswer && dom.resultDiv) {
        displayAnswer(lastAnswer);
    }
    
    // Cập nhật trạng thái các nút tùy chọn
    if (dom.autoFillToggle) dom.autoFillToggle.checked = autoFillEnabled;
    if (dom.autoSubmitToggle) dom.autoSubmitToggle.checked = autoSubmitEnabled;
}

// Xử lý tên người dùng
async function fetchUserName() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Kiểm tra xem tab có tồn tại và không phải trang chrome://
        if (!tab || !tab.id || !tab.url || tab.url.startsWith('chrome://')) {
            return '';
        }

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // Danh sách các selector có thể chứa tên người dùng
                const selectors = [
                    'h6.ng-tns-c1366681314-11',
                    '.user-name',
                    '.username',
                    '.profile-name',
                    'h6[class*="ng-tns"]'
                ];
                
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element && element.textContent.trim()) {
                        return element.textContent.trim();
                    }
                }
                return '';
            },
        });
        
        return (result && result.length > 0 && result[0]?.result) ? result[0].result : '';
    } catch (error) {
        console.error('Lỗi khi lấy tên người dùng:', error);
        return '';
    }
}

// Hiển thị loading và thông báo
function showLoading(message = "Đang giải bài tập...") {
    if (!dom.loadingIndicator || !dom.resultDiv || !dom.errorMessage) return;
    
    const messageElement = dom.loadingIndicator.querySelector('p');
    if (messageElement) messageElement.textContent = message;
    dom.loadingIndicator.style.display = 'flex';
    dom.resultDiv.style.display = 'none';
    dom.errorMessage.style.display = 'none';
}

function hideLoading() {
    if (!dom.loadingIndicator || !dom.resultDiv) return;
    
    dom.loadingIndicator.style.display = 'none';
    dom.resultDiv.style.display = 'block';
}

function showError(message) {
    if (!dom.errorMessage || !dom.resultDiv || !dom.loadingIndicator) return;
    
    dom.errorMessage.textContent = message;
    dom.errorMessage.style.display = 'block';
    dom.resultDiv.style.display = 'none';
    dom.loadingIndicator.style.display = 'none';
}

function showSuccess(message, duration = 3000) {
    const successMessage = document.createElement('div');
    successMessage.className = 'success-message';
    successMessage.textContent = message;
    
    // Thêm vào body và tự động xóa sau vài giây
    document.body.appendChild(successMessage);
    
    setTimeout(() => {
        successMessage.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(successMessage);
        }, 300);
    }, duration);
}

// Xử lý toggle và cài đặt
function handleAutoFillToggle(e) {
    autoFillEnabled = e.target.checked;
    chrome.storage.local.set({ autoFillEnabled });
}

function handleAutoSubmitToggle(e) {
    autoSubmitEnabled = e.target.checked;
    chrome.storage.local.set({ autoSubmitEnabled });
}

function toggleHistory() {
    if (!dom.historyContent) return;
    
    const isVisible = dom.historyContent.style.display !== 'none';
    dom.historyContent.style.display = isVisible ? 'none' : 'block';
    
    // Cập nhật icon
    const toggleIcon = this.querySelector('.toggle-icon');
    if (toggleIcon) {
        toggleIcon.classList.toggle('fa-chevron-down');
        toggleIcon.classList.toggle('fa-chevron-up');
    }
    
    // Nếu đang hiển thị, tải lịch sử
    if (!isVisible) {
        loadHistory();
    }
}

function openSettingsModal() {
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) settingsModal.style.display = 'flex';
}

function closeModal() {
    const modals = document.querySelectorAll('.modal');
    if (modals) {
        modals.forEach(modal => {
            modal.style.display = 'none';
        });
    }
}

function saveSettings() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const autoSaveToggle = document.getElementById('autoSaveToggle');
    
    const settings = {
        darkMode: darkModeToggle ? darkModeToggle.checked : false,
        fontSize: fontSizeSelect ? fontSizeSelect.value : 'medium',
        apiKey: apiKeyInput ? apiKeyInput.value : '',
        autoSave: autoSaveToggle ? autoSaveToggle.checked : false
    };
    
    chrome.storage.local.set({ settings }, () => {
        // Áp dụng ngay lập tức các cài đặt
        applySettings(settings);
        showSuccess('Đã lưu cài đặt thành công!');
        closeModal();
    });
}

function showHelpInfo() {
    alert("Hướng dẫn sử dụng:\n1. Mở bài tập cần giải\n2. Nhấn 'Giải ngay' để phân tích\n3. Bật 'Tự động điền đáp án' nếu muốn điền tự động");
}

function showReportForm() {
    alert("Tính năng báo lỗi sẽ sớm được cập nhật. Vui lòng liên hệ qua email: duongthao@example.com");
}

// Giải câu hỏi
async function solveQuestion() {
    if (isProcessing) return;
    isProcessing = true;

    // Cập nhật UI
    if (dom.autoSolveBtn) {
        dom.autoSolveBtn.disabled = true;
        dom.autoSolveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    }
    showLoading("Đang chuẩn bị giải...");
    
    try {
        // Chụp màn hình
        showLoading("Đang chụp màn hình...");
        const screenshotUrl = await captureScreen();
        if (!screenshotUrl) {
            throw new Error("Không thể chụp màn hình. Vui lòng cấp quyền cho extension.");
        }

        // Phân tích câu hỏi
        showLoading("Đang phân tích câu hỏi...");
        const base64Image = screenshotUrl.split(',')[1];
        const payload = createGeminiPayload(base64Image);
        
        // Gọi API
        showLoading("Đang xử lý bằng AI...");
        const answer = await callGeminiAPI(payload);

        if (!answer) {
            throw new Error("Không nhận được kết quả từ API.");
        }

        // Hiển thị kết quả
        hideLoading();
        displayAnswer(answer);
        
        // Cập nhật thống kê
        updateStatistics(answer);
        
        // Lưu vào lịch sử
        saveToHistory(answer);
        
        // Tự động điền nếu được bật
        if (autoFillEnabled) {
            await autoFillAnswer(answer.answerPart);
        }
        
        // Tự động nộp bài nếu được bật
        if (autoSubmitEnabled) {
            await autoSubmitAnswer();
        }
    } catch (error) {
        console.error("Lỗi giải câu hỏi:", error);
        showError("Lỗi: " + error.message);
    } finally {
        isProcessing = false;
        if (dom.autoSolveBtn) {
            dom.autoSolveBtn.disabled = false;
            dom.autoSolveBtn.innerHTML = '<i class="fa-solid fa-brain"></i> Giải ngay';
        }
    }
}

// Chụp màn hình
async function captureScreen() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
            throw new Error("Không tìm thấy tab hiện tại");
        }
        
        return await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    } catch (error) {
        console.error("Lỗi chụp màn hình:", error);
        throw new Error("Không thể chụp màn hình. Vui lòng cấp quyền cho extension.");
    }
}

// Chuẩn bị dữ liệu cho API
function createGeminiPayload(base64Image) {
    return {
        "contents": [
            {
                "parts": [
                    {
                        "text":
                            "Giải bài tập này và cung cấp câu trả lời theo định dạng sau, và phân tích xem có bao nhiêu câu hỏi:\n\n" +
                            "[ĐÁP ÁN]\n{đáp án chính xác, bao gồm toàn bộ nội dung}\n\n" +
                            "[GIẢI THÍCH]\n{giải thích ngắn gọn}\n\n" +
                            "[ĐỘ TIN CẬY]\n{ước tính phần trăm chính xác từ 0-100%}",
                    },
                    {
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": base64Image,
                        },
                    },
                ],
            },
        ],
    };
}

// Lấy API key (từ storage hoặc mặc định)
async function getApiKey() {
    try {
        const result = await chrome.storage.local.get(['settings']);
        if (result.settings && result.settings.apiKey && result.settings.apiKey.trim() !== '') {
            return result.settings.apiKey;
        }
        return atob(encodedApiKey).split('').reverse().join('');
    } catch (error) {
        console.error("Lỗi khi lấy API key:", error);
        return atob(encodedApiKey).split('').reverse().join('');
    }
}

// Gọi API Gemini
async function callGeminiAPI(payload) {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
        try {
            attempts++;
            const apiKey = await getApiKey();
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 429 && attempts < maxAttempts) {
                    // Lỗi rate limit, thử lại sau 1 giây
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                throw new Error(`Lỗi API (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            
            if (!data || !data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error("Định dạng phản hồi API không hợp lệ.");
            }
            
            const parts = data.candidates[0].content.parts;
            if (!parts || parts.length === 0 || !parts[0].text) {
                throw new Error("Không có nội dung trong phản hồi API.");
            }
            
            const answer = parts[0].text;
            return processGeminiAnswer(answer);
        } catch (error) {
            console.error("Lỗi khi gọi API:", error);
            if (attempts >= maxAttempts) {
                throw new Error(`Lỗi kết nối API: ${error.message}`);
            }
        }
    }
}

// Xử lý kết quả từ API
function processGeminiAnswer(answer) {
    try {
        const answerMatch = answer.match(/\[ĐÁP ÁN\]\s*([\s\S]*?)(?=\n\[GIẢI THÍCH\]|$)/);
        const explanationMatch = answer.match(/\[GIẢI THÍCH\]\s*([\s\S]*?)(?=\n\[ĐỘ TIN CẬY\]|$)/);
        const confidenceMatch = answer.match(/\[ĐỘ TIN CẬY\]\s*(\d+)%/);

        return {
            answerPart: answerMatch ? answerMatch[1].trim() : answer.split("\n")[0],
            explanationPart: explanationMatch ? explanationMatch[1].trim() : 'Không có giải thích.',
            confidence: confidenceMatch ? parseInt(confidenceMatch[1], 10) : 70,
            rawText: answer,
            timestamp: new Date().toLocaleString()
        };
    } catch (error) {
        console.error("Lỗi xử lý câu trả lời của Gemini:", error);
        return { 
            answerPart: answer.substring(0, 100) + '...', 
            explanationPart: 'Không thể xử lý giải thích.', 
            confidence: 50, 
            rawText: answer,
            timestamp: new Date().toLocaleString()
        };
    }
}

// Hiển thị kết quả
function displayAnswer(answer) {
    if (!answer || !dom.resultDiv) return;
    
    let html = '';
    
    // Phần đáp án
    html += `
        <div class="answer-section">
            <div class="section-title"><i class="fa-solid fa-check-circle"></i> ĐÁP ÁN:</div>
            <div class="section-content">${formatAnswerText(answer.answerPart)}</div>
        </div>
    `;
    
    // Phần giải thích
    html += `
        <div class="explanation-section">
            <div class="section-title"><i class="fa-solid fa-info-circle"></i> GIẢI THÍCH:</div>
            <div class="section-content">${formatExplanationText(answer.explanationPart)}</div>
        </div>
    `;
    
    // Phần độ tin cậy
    html += createConfidenceBadge(answer.confidence);
    
    // Cập nhật giao diện
    dom.resultDiv.innerHTML = html;
    dom.resultDiv.style.display = 'block';
    
    // Lưu lại kết quả cuối
    lastAnswer = answer;
    chrome.storage.local.set({ lastAnswer });
}

// Định dạng văn bản đáp án
function formatAnswerText(text) {
    if (!text) return 'Không có đáp án';
    
    // Xác định nếu có nhiều câu hỏi
    const multipleAnswersRegex = /\[ĐÁP ÁN (\d+)\]/g;
    if (multipleAnswersRegex.test(text)) {
        return text.replace(/\[ĐÁP ÁN (\d+)\]([\s\S]*?)(?=\n\[ĐÁP ÁN \d+\]|$)/g, (match, num, content) => {
            return `<div class="answer-item">
                <div class="answer-number">Câu ${num}:</div>
                <div class="answer-content">${content.trim().replace(/\n/g, '<br>')}</div>
            </div>`;
        });
    }
    
    // Trường hợp đáp án đơn
    return text.replace(/\n/g, '<br>');
}

// Định dạng văn bản giải thích
function formatExplanationText(text) {
    if (!text) return 'Không có giải thích';
    return text.replace(/\n/g, '<br>');
}

// Tạo badge độ tin cậy
function createConfidenceBadge(confidence) {
    let colorClass = 'confidence-low';
    if (confidence >= 80) colorClass = 'confidence-high';
    else if (confidence >= 50) colorClass = 'confidence-medium';
    
    return `<div class="confidence-badge ${colorClass}">
                <i class="fa-solid fa-chart-line"></i>
                ĐỘ TIN CẬY: ${confidence}%
            </div>`;
}

// Chức năng tự động điền đáp án - đã sửa lỗi
async function autoFillAnswer(answerText) {
    if (!answerText || !autoFillEnabled) return false;
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) throw new Error("Không tìm thấy tab đang hoạt động.");

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (answer) => {
                try {
                    let isSuccess = false;
                    console.log("Đang cố gắng điền đáp án:", answer);
                    
                    // Xử lý trường hợp câu hỏi trắc nghiệm
                    const processMultipleChoice = () => {
                        // Tìm các nút radio
                        const radioButtons = document.querySelectorAll('input[type="radio"]');
                        if (radioButtons.length === 0) return false;
                        
                        // Tìm đáp án trong văn bản (A, B, C, D)
                        let choiceLetters = [];
                        // Tìm theo mẫu "Đáp án: X" hoặc chỉ chữ cái đầu tiên
                        const answerPattern = answer.match(/(đáp án|đáp|câu trả lời|chọn|chọn đáp án)[\s\:]+([A-D])/i);
                        if (answerPattern) {
                            choiceLetters.push(answerPattern[2].toUpperCase());
                        } else {
                            // Nếu không tìm được mẫu rõ ràng, lấy chữ cái đầu tiên
                            const firstLetterMatch = answer.match(/^[A-D]/i);
                            if (firstLetterMatch) {
                                choiceLetters.push(firstLetterMatch[0].toUpperCase());
                            }
                        }
                        
                        if (choiceLetters.length === 0) return false;
                        
                        console.log("Tìm thấy lựa chọn:", choiceLetters);
                        
                        // Tìm và chọn radio button tương ứng
                        for (const letter of choiceLetters) {
                            for (const btn of radioButtons) {
                                // Kiểm tra label hoặc phần tử cha
                                const label = btn.parentElement?.textContent || '';
                                const parentText = btn.parentElement?.parentElement?.textContent || '';
                                
                                if (label.trim().startsWith(letter) || 
                                    parentText.includes(letter + ".") || 
                                    parentText.includes(letter + ")")) {
                                    console.log("Đã chọn radio button:", letter);
                                    btn.checked = true;
                                    btn.click(); // Đảm bảo sự kiện click được kích hoạt
                                    btn.dispatchEvent(new Event('change', { bubbles: true }));
                                    return true;
                                }
                            }
                        }
                        
                        return false;
                    };
                    
                    // Xử lý trường hợp checkbox nhiều lựa chọn
                    const processCheckboxes = () => {
                        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                        if (checkboxes.length === 0) return false;
                        
                        // Tìm tất cả các lựa chọn (A, B, C, D) trong đáp án
                        const choices = answer.match(/[A-D]/g) || [];
                        if (choices.length === 0) return false;
                        
                        console.log("Tìm thấy các lựa chọn checkbox:", choices);
                        let selected = false;
                        
                        // Reset tất cả checkbox trước (bỏ chọn tất cả)
                        checkboxes.forEach(cb => {
                            cb.checked = false;
                            cb.dispatchEvent(new Event('change', { bubbles: true }));
                        });
                        
                        // Chọn các checkbox phù hợp
                        for (const choice of choices) {
                            for (const checkbox of checkboxes) {
                                const label = checkbox.parentElement?.textContent || '';
                                const parentText = checkbox.parentElement?.parentElement?.textContent || '';
                                
                                if (label.trim().startsWith(choice) || 
                                    parentText.includes(choice + ".") || 
                                    parentText.includes(choice + ")")) {
                                    console.log("Đã chọn checkbox:", choice);
                                    checkbox.checked = true;
                                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                                    selected = true;
                                }
                            }
                        }
                        
                        return selected;
                    };
                    
                    // Xử lý trường hợp nhập text
                    const processTextInputs = () => {
                        // Tìm các trường nhập văn bản khác nhau
                        const textInputs = [
                            ...document.querySelectorAll('input[type="text"]:not([style*="display: none"])'),
                            ...document.querySelectorAll('textarea:not([style*="display: none"])'),
                            ...document.querySelectorAll('[contenteditable="true"]:not([style*="display: none"])'),
                            ...document.querySelectorAll('.ck-editor__editable:not([style*="display: none"])')
                        ];
                        
                        if (textInputs.length === 0) return false;
                        
                        console.log("Tìm thấy", textInputs.length, "trường nhập văn bản");
                        let filled = false;
                        
                        for (const input of textInputs) {
                            if (input.disabled) continue;
                            
                            try {
                                if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
                                    input.value = answer;
                                    // Kích hoạt các sự kiện để đảm bảo JavaScript phát hiện sự thay đổi
                                    input.dispatchEvent(new Event('input', { bubbles: true }));
                                    input.dispatchEvent(new Event('change', { bubbles: true }));
                                    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                                } else {
                                    // Xử lý các trường contenteditable
                                    input.innerHTML = answer;
                                    input.dispatchEvent(new Event('input', { bubbles: true }));
                                    input.dispatchEvent(new Event('change', { bubbles: true }));
                                }
                                console.log("Đã điền vào trường nhập văn bản");
                                filled = true;
                            } catch (e) {
                                console.error("Lỗi khi điền vào trường nhập liệu:", e);
                            }
                        }
                        
                        return filled;
                    };
                    
                    // Xử lý các trường CKEditor (nếu có)
                    const processCKEditor = () => {
                        const ckEditors = document.querySelectorAll('.ck-editor');
                        if (ckEditors.length === 0) return false;
                        
                        console.log("Tìm thấy CKEditor");
                        let filled = false;
                        
                        // Thử tìm instance của CKEditor
                        if (window.CKEDITOR) {
                            for (const name in window.CKEDITOR.instances) {
                                try {
                                    window.CKEDITOR.instances[name].setData(answer);
                                    console.log("Đã điền vào CKEditor:", name);
                                    filled = true;
                                } catch (e) {
                                    console.error("Lỗi khi điền vào CKEditor:", e);
                                }
                            }
                        } else {
                            // Nếu không tìm được instance, thử tìm các editable area
                            const editableAreas = document.querySelectorAll('.ck-editor__editable');
                            for (const area of editableAreas) {
                                try {
                                    area.innerHTML = answer;
                                    area.dispatchEvent(new Event('input', { bubbles: true }));
                                    filled = true;
                                } catch (e) {
                                    console.error("Lỗi khi điền vào vùng soạn thảo:", e);
                                }
                            }
                        }
                        
                        return filled;
                    };
                    
                    // Thực hiện các phương thức điền đáp án theo thứ tự ưu tiên
                    isSuccess = processMultipleChoice() || 
                               processCheckboxes() || 
                               processCKEditor() || 
                               processTextInputs();
                    
                    return isSuccess;
                } catch (e) {
                    console.error("Lỗi khi điền đáp án:", e);
                    return false;
                }
            },
            args: [answerText]
        });
        
        const isSuccess = result && result[0] && result[0].result;
        if (isSuccess) {
            showSuccess("Đã tự động điền đáp án!");
        } else {
            console.log("Không thể tự động điền đáp án.");
            showError("Không thể tự động điền đáp án. Có thể định dạng không được hỗ trợ.");
        }
        
        return isSuccess;
    } catch (error) {
        console.error("Lỗi khi tự động điền đáp án:", error);
        showError("Lỗi: " + error.message);
        return false;
    }
}

// Tự động nộp bài
async function autoSubmitAnswer() {
    if (!autoSubmitEnabled) return;
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) throw new Error("Không tìm thấy tab đang hoạt động.");

        // Thực hiện nhấn nút nộp bài
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // Danh sách các bộ chọn có thể là nút nộp bài
                const selectors = [
                    'button[type="submit"]',
                    'button.submit-button',
                    'button.btn-submit',
                    'button:contains("Nộp bài")',
                    'button:contains("Submit")',
                    'input[type="submit"]'
                ];
                
                // Thử tìm và nhấn vào nút đầu tiên được tìm thấy
                for (const selector of selectors) {
                    try {
                        const submitButtons = document.querySelectorAll(selector);
                        for (const button of submitButtons) {
                            if (button && 
                                button.textContent && 
                                (button.textContent.toLowerCase().includes('nộp') || 
                                 button.textContent.toLowerCase().includes('submit') ||
                                 button.value?.toLowerCase().includes('nộp') ||
                                 button.value?.toLowerCase().includes('submit'))) {
                      // Kiểm tra nút không bị ẩn hoặc vô hiệu hóa
                                if (!button.disabled && 
                                    window.getComputedStyle(button).display !== 'none' && 
                                    window.getComputedStyle(button).visibility !== 'hidden') {
                                    button.click();
                                    return true;
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Lỗi tìm nút submit:", err);
                    }
                }
                return false;
            }
        });
        
        const isSuccess = result && result[0] && result[0].result;
        if (isSuccess) {
            showSuccess("Đã tự động nộp bài!");
        } else {
            console.log("Không tìm thấy nút nộp bài hoặc nút bị vô hiệu hóa.");
        }
        
        return isSuccess;
    } catch (error) {
        console.error("Lỗi khi tự động nộp bài:", error);
        return false;
    }
}

// Sao chép đáp án
async function copyAnswerToClipboard() {
    if (!lastAnswer) {
        showError("Không có đáp án để sao chép!");
        return;
    }
    
    try {
        await navigator.clipboard.writeText(lastAnswer.answerPart);
        showSuccess("Đã sao chép đáp án vào clipboard!");
    } catch (error) {
        console.error("Lỗi khi sao chép:", error);
        showError("Không thể sao chép. Vui lòng thử lại.");
    }
}

// Chia sẻ đáp án
function shareAnswer() {
    if (!lastAnswer) {
        showError("Không có đáp án để chia sẻ!");
        return;
    }
    
    // Tạo URL chia sẻ
    const shareUrl = `https://example.com/share?answer=${encodeURIComponent(lastAnswer.answerPart.substring(0, 100))}`;
    
    // Mở hộp thoại chia sẻ
    const shareModal = document.getElementById('shareModal');
    const shareUrlInput = document.getElementById('shareUrlInput');
    
    if (shareModal && shareUrlInput) {
        shareUrlInput.value = shareUrl;
        shareModal.style.display = 'flex';
        shareUrlInput.select();
    } else {
        // Phương án dự phòng nếu không có modal
        try {
            navigator.clipboard.writeText(shareUrl);
            showSuccess("Đã sao chép liên kết chia sẻ!");
        } catch (error) {
            showError("Không thể tạo liên kết chia sẻ.");
        }
    }
}

// Lưu và hiển thị lịch sử
function saveToHistory(answer) {
    if (!answer) return;
    
    chrome.storage.local.get(['history'], (result) => {
        const history = result.history || [];
        
        // Thêm vào đầu mảng
        history.unshift({
            answer: answer.answerPart,
            explanation: answer.explanationPart,
            confidence: answer.confidence,
            timestamp: answer.timestamp || new Date().toLocaleString()
        });
        
        // Giới hạn số lượng mục lịch sử
        const maxHistoryItems = 20;
        if (history.length > maxHistoryItems) {
            history.length = maxHistoryItems;
        }
        
        // Lưu lại
        chrome.storage.local.set({ history });
    });
}

function loadHistory() {
    if (!dom.historyItems) return;
    
    chrome.storage.local.get(['history'], (result) => {
        const history = result.history || [];
        
        if (history.length === 0) {
            dom.historyItems.innerHTML = '<div class="empty-history">Chưa có lịch sử giải bài tập.</div>';
            return;
        }
        
        let html = '';
        history.forEach((item, index) => {
            html += `
                <div class="history-item">
                    <div class="history-time">${item.timestamp}</div>
                    <div class="history-answer">${item.answer.substring(0, 50)}${item.answer.length > 50 ? '...' : ''}</div>
                    <div class="history-actions">
                        <button class="history-view-btn" data-index="${index}">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button class="history-delete-btn" data-index="${index}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        dom.historyItems.innerHTML = html;
        
        // Thêm event listeners cho các nút
        document.querySelectorAll('.history-view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index, 10);
                viewHistoryItem(index);
            });
        });
        
        document.querySelectorAll('.history-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index, 10);
                deleteHistoryItem(index);
            });
        });
    });
}

function viewHistoryItem(index) {
    chrome.storage.local.get(['history'], (result) => {
        const history = result.history || [];
        if (index >= 0 && index < history.length) {
            const item = history[index];
            const answer = {
                answerPart: item.answer,
                explanationPart: item.explanation,
                confidence: item.confidence,
                timestamp: item.timestamp
            };
            
            displayAnswer(answer);
        }
    });
}

function deleteHistoryItem(index) {
    chrome.storage.local.get(['history'], (result) => {
        const history = result.history || [];
        if (index >= 0 && index < history.length) {
            history.splice(index, 1);
            chrome.storage.local.set({ history }, () => {
                loadHistory();
                showSuccess("Đã xóa mục lịch sử!");
            });
        }
    });
}

// Cập nhật thống kê
function updateStatistics(answer) {
    chrome.storage.local.get(['statistics'], (result) => {
        const stats = result.statistics || {
            solved: 0,
            totalTime: 0,
            correctCount: 0,
            startTime: Date.now() // Thời gian bắt đầu phiên
        };
        
        // Cập nhật số lượng bài đã giải
        stats.solved++;
        
        // Tính thời gian giải
        const currentTime = Date.now();
        const sessionTime = (currentTime - stats.lastSolveTime) || 0;
        stats.totalTime += sessionTime;
        stats.lastSolveTime = currentTime;
        
        // Đánh dấu là đúng nếu độ tin cậy cao
        if (answer.confidence >= 80) {
            stats.correctCount++;
        }
        
        // Lưu lại thống kê
        chrome.storage.local.set({ statistics: stats });
        
        // Hiển thị thống kê
        loadStatistics();
    });
}

function loadStatistics() {
    chrome.storage.local.get(['statistics'], (result) => {
        const stats = result.statistics || { solved: 0, totalTime: 0, correctCount: 0 };
        
        if (dom.solvedCount) {
            dom.solvedCount.textContent = stats.solved;
        }
        
        if (dom.averageTime && stats.solved > 0) {
            const avgTimeSeconds = Math.round(stats.totalTime / stats.solved / 1000);
            dom.averageTime.textContent = `${avgTimeSeconds}s`;
        }
        
        if (dom.accuracy && stats.solved > 0) {
            const accuracyPercent = Math.round((stats.correctCount / stats.solved) * 100);
            dom.accuracy.textContent = `${accuracyPercent}%`;
        }
    });
}