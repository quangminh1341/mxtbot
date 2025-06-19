const DISCORD_SERVER_INVITE_URL = 'https://discord.gg/7Q8mzW4DGt'; // <<<<<<< CHÚ Ý: CẬP NHẬT LINK NÀY VỚI LINK MỜI SERVER CỦA BẠN!

let currentPaymentCountdownInterval; 
let paymentTimeout;
let paymentStartTime;
let paymentPollingInterval;

let discordUserData = null;
let currentPaymentData = {
    planName: null,
    amount: null,
    transactionCode: null
};


// Load Discord user data from localStorage on script load
function loadDiscordUserDataFromStorage() {
    const storedData = localStorage.getItem('discordUserData');
    if (storedData) {
        try {
            discordUserData = JSON.parse(storedData);
            console.log('Loaded Discord user data from localStorage:', discordUserData);
        } catch (e) {
            console.error('Error parsing stored Discord user data:', e);
            localStorage.removeItem('discordUserData'); // Clear bad data
            discordUserData = null;
        }
    }
}

// Function to update the header UI based on login status
function updateLoginUI() {
    const discordNavLoginBtnContainer = document.getElementById('discordNavLoginBtnContainer');
    const loggedInUserDisplay = document.getElementById('loggedInUserDisplay');
    const displayUsernameSpan = document.getElementById('displayUsername');
    const logoutNavBtn = document.getElementById('logoutNavBtn');
    const discordAvatarDisplay = document.getElementById('discordAvatarDisplay'); // Get the avatar element

    if (discordUserData) {
        // User is logged in
        if (discordNavLoginBtnContainer) discordNavLoginBtnContainer.style.display = 'none'; // Hide login button
        if (loggedInUserDisplay) loggedInUserDisplay.style.display = 'flex'; // Show user info container (using flex)

        // Display username, prioritizing global_name for new Discord usernames
        if (displayUsernameSpan) {
            displayUsernameSpan.textContent = discordUserData.global_name || discordUserData.username || 'Người dùng Discord';
            // Discord has deprecated discriminators for new usernames.
            // If discriminator is '0' or missing, assume new username system.
            if (discordUserData.discriminator && discordUserData.discriminator !== '0') {
                displayUsernameSpan.textContent += `#${discordUserData.discriminator}`;
            }
        }

        // Set the avatar source
        if (discordAvatarDisplay && discordUserData.id && discordUserData.avatar) {
            discordAvatarDisplay.src = `https://cdn.discordapp.com/avatars/${discordUserData.id}/${discordUserData.avatar}.png?size=32`;
        } else if (discordAvatarDisplay) {
            // Fallback for default avatar (discriminator is now 0 for new Discord users)
            const defaultAvatarIndex = (discordUserData.discriminator === '0' || !discordUserData.discriminator)
                ? (discordUserData.id ? parseInt(discordUserData.id.slice(-5)) % 5 : 0) // Use last 5 digits of ID for a more random default if discriminator is 0
                : parseInt(discordUserData.discriminator) % 5;
            discordAvatarDisplay.src = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png?size=32`;
        }
        
        if (logoutNavBtn) logoutNavBtn.onclick = logoutDiscord; // Attach logout handler
    } else {
        // User is logged out
        if (discordNavLoginBtnContainer) discordNavLoginBtnContainer.style.display = 'block'; // Show login button
        if (loggedInUserDisplay) loggedInUserDisplay.style.display = 'none'; // Hide user info container
    }
}

// Function to handle Discord logout
function logoutDiscord() {
    localStorage.removeItem('discordUserData');
    discordUserData = null; // Clear the global variable
    updateLoginUI(); // Update UI to logged-out state
    alert('Bạn đã đăng xuất khỏi Discord.');
    // Clear any Discord OAuth code from the URL for a cleaner state
    window.history.replaceState({}, '', window.location.pathname);
    closePaymentModal(); // Close modal if it's open and reset it
    closeSuccessModal(); // Close success modal if open
}

// Function for Login with Discord (from modal button and updated navbar button)
async function loginWithDiscord() { // Đảm bảo cái này là async
    if (currentPaymentData.planName && currentPaymentData.amount) {
        localStorage.setItem('pendingPlanName', currentPaymentData.planName);
        localStorage.setItem('pendingPlanPrice', currentPaymentData.amount.toString());
    }

    try {
        // Lấy URL auth từ server của bạn
        const response = await fetch('/api/discord-auth-url'); // CUỘC GỌI NÀY PHẢI ĐƯỢC THỰC HIỆN
        const data = await response.json();
        const discordAuthUrl = data.authUrl;

        // Chuyển hướng người dùng
        window.location.href = discordAuthUrl;
    } catch (error) {
        console.error('Lỗi khi lấy URL xác thực Discord từ server:', error);
        alert('Không thể bắt đầu đăng nhập Discord. Vui lòng thử lại sau.');
    }
}

// Function for joining Discord server (from navbar button)
function joinDiscordServer() {
    window.open(DISCORD_SERVER_INVITE_URL, '_blank');
}

// --- Utility functions for payment flow ---

// Hàm tạo chuỗi số ngẫu nhiên có độ dài xác định (ví dụ: cho transactionCode nếu không dùng Base36)
function generateRandomNumberString(length) {
    let result = '';
    const characters = '0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

// Hàm tạo nội dung chuyển khoản ngắn gọn (sử dụng Base36)
function generateShortTransferContent() {
    const randomNumPart = Math.floor(Math.random() * 0xFFFFFFFF); 
    const randomBase36 = randomNumPart.toString(36); 
    const timestampBase36 = Date.now().toString(36);
    // Sử dụng tiền tố 'MXT' hoặc 'MG' tùy thích
    const transferContent = `Bố Minh`; 
    return transferContent.toUpperCase();
}

// --- Webhook Sending Function ---
/**
 * Gửi thông báo thanh toán thành công đến Discord Webhook.
 * @param {string} planName - Tên gói đã mua.
 * @param {number} planPrice - Giá tiền của gói.
 * @param {object} userData - Dữ liệu người dùng Discord (id, username, avatar, discriminator).
 * @param {boolean} isSimulated - true nếu đây là giao dịch giả lập (user đặc biệt), false nếu là thật.
 * @param {string} transactionCode - Mã giao dịch.
 * @param {string} [serverId=null] - ID máy chủ Discord (tùy chọn, chỉ gửi khi có).
 */
// --- Payment Modal Functions ---

// Main function to show payment modal, now handles login state
async function showPaymentModal() {
    const modal = document.getElementById('paymentModal');
    modal.style.display = 'flex';

    // Clear previous states
    document.getElementById('paymentStatusMessage').textContent = '';
    clearInterval(currentPaymentCountdownInterval);
    clearTimeout(paymentTimeout);
    clearInterval(paymentPollingInterval); // Stop any ongoing payment checks

    // Gán tên gói vào tiêu đề modal ngay lập tức
    const modalPlanNameDisplay = document.getElementById('modalPlanNameDisplay');
    if (modalPlanNameDisplay) modalPlanNameDisplay.textContent = currentPaymentData.planName;

    // Xử lý gói đặc biệt "CUSTOM"
    if (currentPaymentData.planName === 'CUSTOM') {
        document.getElementById('discordLoginSection').style.display = 'none';
        document.getElementById('paymentDetailsSection').style.display = 'none';
        document.getElementById('contactAdminMessage').style.display = 'block';
        document.getElementById('paymentCountdown').style.display = 'none';
        return; 
    }

    if (discordUserData) {
        await showPaymentDetails(); // If logged in, proceed directly to payment details
    } else {
        showDiscordLoginSection(); // Otherwise, show Discord login prompt
    }
}

// SỬA ĐỔI HÀM NÀY: KHÔNG RESET currentPaymentData Ở ĐÂY
function closePaymentModal() {
    const modal = document.getElementById('paymentModal');
    modal.style.display = 'none';
    clearInterval(currentPaymentCountdownInterval);
    clearTimeout(paymentTimeout);
    clearInterval(paymentPollingInterval); // Ensure all intervals/timeouts are cleared
    document.getElementById('paymentStatusMessage').textContent = ''; // Clear status message
    
    // KHÔNG reset currentPaymentData Ở ĐÂY!
    // currentPaymentData = { planName: null, amount: null, transactionCode: null }; 
    
    // Chỉ xóa pending data nếu nó chỉ dành cho việc chuyển hướng sau OAuth
    localStorage.removeItem('pendingPlanName'); 
    localStorage.removeItem('pendingPlanPrice');

    // Also reset modal sections visibility
    document.getElementById('discordLoginSection').style.display = 'none';
    document.getElementById('paymentDetailsSection').style.display = 'none';
    document.getElementById('contactAdminMessage').style.display = 'none';
}

function openSuccessModal() {
    const modal = document.getElementById('successModal');
    modal.style.display = 'flex';
    // Cập nhật thông tin trong success modal
    const successPlanNameDisplay = document.getElementById('successPlanNameDisplay');
    const successPlanAmountDisplay = document.getElementById('successPlanAmountDisplay');
    const discordUsernameDisplay = document.getElementById('discordUsernameDisplay');
    const discordUserIdDisplay = document.getElementById('discordUserIdDisplay');

    if (successPlanNameDisplay) successPlanNameDisplay.textContent = currentPaymentData.planName;
    if (successPlanAmountDisplay) successPlanAmountDisplay.textContent = currentPaymentData.amount.toLocaleString('vi-VN');
    
    if (discordUserData) {
        if (discordUsernameDisplay) discordUsernameDisplay.textContent = `${discordUserData.global_name || discordUserData.username}${discordUserData.discriminator === '0' || !discordUserData.discriminator ? '' : `#${discordUserData.discriminator}`}`;
        if (discordUserIdDisplay) discordUserIdDisplay.textContent = discordUserData.id;
    } else {
        if (discordUsernameDisplay) discordUsernameDisplay.textContent = 'Người dùng không xác định';
        if (discordUserIdDisplay) discordUserIdDisplay.textContent = 'N/A';
    }
}

function closeSuccessModal() {
    const modal = document.getElementById('successModal');
    modal.style.display = 'none';
    document.getElementById('discordServerId').value = ''; // Clear input field
    // Optionally refresh or redirect to clear state after successful submission
    // window.location.reload();
}

function showDiscordLoginSection() {
    document.getElementById('discordLoginSection').style.display = 'block';
    document.getElementById('paymentDetailsSection').style.display = 'none';
    document.getElementById('contactAdminMessage').style.display = 'none';
    // Make sure the login button inside the modal links to Discord login
    const loginDiscordBtn = document.querySelector('#paymentModal .discord-login-btn'); 
    if(loginDiscordBtn) {
        loginDiscordBtn.onclick = loginWithDiscord;
    }
    // Update the "join discord" button in the modal if it exists
    const joinDiscordBtn = document.querySelector('#paymentModal .join-discord-button');
    if(joinDiscordBtn) {
        joinDiscordBtn.style.display = 'inline-flex';
        joinDiscordBtn.textContent = 'Đăng nhập';
        joinDiscordBtn.onclick = loginWithDiscord;
    }
    document.getElementById('paymentCountdown').style.display = 'none';
}

async function showPaymentDetails() {
    document.getElementById('discordLoginSection').style.display = 'none';
    document.getElementById('paymentDetailsSection').style.display = 'block';
    document.getElementById('contactAdminMessage').style.display = 'none';
    document.getElementById('paymentCountdown').style.display = 'block'; // Hiển thị đếm ngược

    // --- LOGIC DÀNH CHO NGƯỜI DÙNG ĐẶC BIỆT ---
    const SPECIAL_USER_ID = "389350643090980869";
    if (discordUserData && discordUserData.id === SPECIAL_USER_ID) {
        console.log(`User ${discordUserData.global_name || discordUserData.username} (${discordUserData.id}) is a special user. Bypassing actual payment.`);
        
        // Tạo một transactionCode giả lập cho người dùng đặc biệt
        currentPaymentData.transactionCode = generateShortTransferContent(); // Assign to currentPaymentData
        
        // Xóa các trạng thái thanh toán và đếm ngược nếu đang chạy
        clearInterval(currentPaymentCountdownInterval);
        clearTimeout(paymentTimeout);
        clearInterval(paymentPollingInterval);

        // Hiển thị thông báo thành công ngay lập tức
        document.getElementById('paymentStatusMessage').textContent = 'Thanh toán thành công!';
        document.getElementById('paymentStatusMessage').style.color = '#00ff00'; // Green for success

        // Gửi webhook với trạng thái giả lập
        await sendPaymentWebhook(
            currentPaymentData.planName, 
            currentPaymentData.amount, 
            discordUserData, 
            true, 
            currentPaymentData.transactionCode 
        ); 

        // Ẩn modal thanh toán và hiển thị modal thành công
        document.getElementById('paymentModal').style.display = 'none';
        openSuccessModal(); 
        alert(`Chào mừng, ${discordUserData.global_name || discordUserData.username}! Giao dịch của bạn đã được thanh toán tự động thành công.`);
        
        // Không cần tiếp tục logic QR code và polling cho người dùng đặc biệt
        return; 
    }
    // --- KẾT THÚC LOGIC NGƯỜI DÙNG ĐẶC BIỆT ---


    // --- Logic bình thường cho các người dùng khác ---
    // Pre-fill user data (plan name, amount) using currentPaymentData
    document.getElementById('paymentDetailsPlanName').textContent = currentPaymentData.planName;
    document.getElementById('selectedPlanAmount').textContent = currentPaymentData.amount.toLocaleString('vi-VN');

    // Generate VietQR and start payment check
    await generateVietQR();
    paymentStartTime = Date.now(); // Reset payment start time for new QR
    startPaymentCountdownDisplay(); // Start visual countdown
    // Pass transactionCode and amount to polling, though it will also use currentPaymentData directly
    startPaymentPolling(currentPaymentData.amount, currentPaymentData.transactionCode); 
}

async function generateVietQR() {
    // Kiểm tra các điều kiện cần thiết trước khi tạo QR
    if (!currentPaymentData.amount || !discordUserData || !discordUserData.id) {
        alert('Vui lòng chọn gói và đăng nhập Discord trước.');
        closePaymentModal(); 
        return;
    }

    // Tạo mã addInfo duy nhất (sẽ dùng làm transactionCode)
    const addInfo = generateRandomNumberString(8); // Using your function

    try {
        const response = await fetch('/api/get-qr-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                purpose: currentPaymentData.planName, 
                amount: currentPaymentData.amount,   
                addInfo: addInfo, 
                userId: discordUserData.id,
                planName: currentPaymentData.planName 
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('qrCodeImage').src = data.qrCodeUrl;
            document.getElementById('transferContentText').textContent = data.transactionCode;
            document.getElementById('bankAccountNumber').textContent = data.bankAccountNumber;
            
            // Cập nhật tên chủ thẻ và tên ngân hàng trên UI 
            document.getElementById('displayBankAccountName').textContent = "NGUYEN THANH THUONG"; 
            document.getElementById('displayBankName').textContent = "MB Bank"; 

            // Store transaction code in currentPaymentData for polling and submitUpgradeRequest
            currentPaymentData.transactionCode = data.transactionCode; 

        } else {
            alert('Lỗi tạo mã QR: ' + (data.message || 'Lỗi không xác định.'));
            console.error('QR generation failed:', data.message);
            closePaymentModal(); 
        }
    } catch (error) {
        console.error('Error generating QR code:', error);
        alert('Lỗi trong quá trình tạo mã QR. Vui lòng thử lại.');
        closePaymentModal(); 
    }
}

// --- Payment Countdown Display Logic ---
function startPaymentCountdownDisplay() {
    clearInterval(currentPaymentCountdownInterval); // Clear any existing countdown interval

    const countdownElement = document.getElementById('paymentCountdown');
    const totalDurationMs = 30 * 60 * 1000; // 30 minutes in milliseconds
    const endTime = paymentStartTime + totalDurationMs; 

    currentPaymentCountdownInterval = setInterval(() => {
        const now = Date.now();
        const timeLeft = endTime - now;

        if (timeLeft <= 0) {
            clearInterval(currentPaymentCountdownInterval);
            countdownElement.textContent = 'Thời gian đã hết!';
            return;
        }

        const minutes = Math.floor(timeLeft / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

        countdownElement.textContent = `Thời gian còn lại: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000); // Update every second
}


// --- Unified Payment Polling Logic ---
async function startPaymentPolling(amount, transactionCode) { 
    // Clear any existing intervals/timeouts to prevent duplicates
    clearInterval(paymentPollingInterval);
    clearTimeout(paymentTimeout);

    const paymentStatusMessage = document.getElementById('paymentStatusMessage');
    paymentStatusMessage.textContent = 'Đang chờ bạn thanh toán...';
    paymentStatusMessage.style.color = '#00ffff'; // Blue-green for pending

    // Set overall timeout for the payment process (30 minutes)
    paymentTimeout = setTimeout(() => {
        clearInterval(paymentPollingInterval); // Stop polling
        clearInterval(currentPaymentCountdownInterval); // Stop countdown display
        paymentStatusMessage.textContent = 'Giao dịch đã hết hạn.';
        paymentStatusMessage.style.color = '#ff4444'; // Red for expired
        alert('Đã hết thời gian chờ thanh toán. Vui lòng thử lại hoặc liên hệ hỗ trợ.');
        closePaymentModal();
    }, 30 * 60 * 1000); // 30 minutes

    // Start polling for payment status every 5 seconds
    paymentPollingInterval = setInterval(async () => {
        // Use currentPaymentData directly here
        if (!currentPaymentData.transactionCode || !currentPaymentData.amount) {
            console.warn('Missing transaction details for payment check. Stopping polling.');
            clearInterval(paymentPollingInterval);
            return;
        }

        try {
            const response = await fetch('/api/check-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactionCode: currentPaymentData.transactionCode, 
                    amount: currentPaymentData.amount,                   
                    userId: discordUserData ? discordUserData.id : null,
                    planName: currentPaymentData.planName                
                })
            });
            const data = await response.json();

            if (data.success && data.isPaid) {
                console.log('Payment successful!');
                clearInterval(paymentPollingInterval); // Stop polling
                clearInterval(currentPaymentCountdownInterval); // Stop countdown display
                clearTimeout(paymentTimeout); // Clear overall timeout
                paymentStatusMessage.textContent = 'Thanh toán thành công! Đang xử lý yêu cầu của bạn...';
                paymentStatusMessage.style.color = '#00ff00'; // Green for success
                alert('Thanh toán thành công! Chúng tôi đang xử lý yêu cầu của bạn.');
                
                // Vẫn đóng modal thanh toán, nhưng KHÔNG reset currentPaymentData
                document.getElementById('paymentModal').style.display = 'none'; 
                openSuccessModal(); // Open success modal, will now have correct data from currentPaymentData

                // --- GỬI WEBHOOK CHO GIAO DỊCH THẬT ---
                sendPaymentWebhook(
                    currentPaymentData.planName, 
                    currentPaymentData.amount, 
                    discordUserData, 
                    false, 
                    currentPaymentData.transactionCode
                ); 

            } else if (data.status === 'pending') {
                paymentStatusMessage.textContent = 'Thanh toán đang chờ xử lý...';
            } else {
                console.log('Payment not yet received or failed:', data.message);
            }
        } catch (error) {
            console.error('Error checking payment status:', error);
            paymentStatusMessage.textContent = 'Lỗi khi kiểm tra trạng thái thanh toán.';
            paymentStatusMessage.style.color = '#ff4444'; 
        }
    }, 5000); // Check every 5 seconds
}


// Hàm gửi ID máy chủ về backend
const submitUpgradeButton = document.querySelector('.submit-server-id-button');

async function submitUpgradeRequest() {
    const serverId = document.getElementById('discordServerId').value.trim();

    // 1. Kiểm tra các điều kiện tiên quyết
    if (!serverId) {
        alert('Vui lòng nhập ID máy chủ Discord của bạn.');
        return;
    }

    if (!discordUserData || !discordUserData.id) { 
        alert('Không tìm thấy thông tin người dùng Discord. Vui lòng đăng nhập lại.');
        return;
    }

    // Sử dụng đối tượng currentPaymentData để truy cập thông tin giao dịch
    // Dữ liệu này PHẢI CÓ TỪ KHI openSuccessModal được gọi
    if (!currentPaymentData.transactionCode || !currentPaymentData.amount || !currentPaymentData.planName) {
        alert('Không tìm thấy thông tin giao dịch. Vui lòng thử lại quá trình thanh toán hoặc liên hệ hỗ trợ.');
        console.error('Lỗi: currentPaymentData bị thiếu trong submitUpgradeRequest', currentPaymentData);
        return;
    }

    // --- BẮT ĐẦU: Logic chống spam ---
    if (submitUpgradeButton) {
        submitUpgradeButton.disabled = true;
        submitUpgradeButton.textContent = 'Đang gửi...';
    }
    // --- KẾT THÚC: Logic chống spam ---

    try {
        const response = await fetch('/api/submit-upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: discordUserData.id,
                username: discordUserData.global_name || discordUserData.username || 'Không xác định',
                email: discordUserData.email || 'Không cung cấp',
                serverId: serverId,
                planName: currentPaymentData.planName, 
                amount: currentPaymentData.amount,     
                transactionCode: currentPaymentData.transactionCode 
            })
        });
        const data = await response.json();

        if (data.success) {
            alert('Yêu cầu nâng cấp Premium đã được gửi thành công! Chúng tôi sẽ xử lý sớm nhất.');
            if (typeof closeSuccessModal === 'function') closeSuccessModal();

            // --- Gửi webhook lần 2 (nếu cần) với thông tin serverId ---
            // LƯU Ý: Nếu backend của bạn đã gửi webhook này, bạn không cần gửi từ frontend.
            // Nếu bạn vẫn muốn gửi từ frontend, hãy sao lưu dữ liệu trước khi reset currentPaymentData.
            // Ví dụ:
            const tempPlanName = currentPaymentData.planName;
            const tempAmount = currentPaymentData.amount;
            const tempTransactionCode = currentPaymentData.transactionCode;

            // Xóa dữ liệu thanh toán hiện tại sau khi gửi thành công yêu cầu nâng cấp
            currentPaymentData = { planName: null, amount: null, transactionCode: null };
            localStorage.removeItem('pendingPlanName'); // Xóa cả pending trong localStorage
            localStorage.removeItem('pendingPlanPrice');

            await sendPaymentWebhook(
                tempPlanName, 
                tempAmount,  
                discordUserData,
                false, // Not simulated
                tempTransactionCode, 
                serverId // Pass the server ID
            );


        } else {
            alert('Có lỗi xảy ra khi gửi yêu cầu: ' + data.message);
        }
    } catch (error) {
        console.error('Error submitting server ID:', error);
        alert('Có lỗi khi gửi ID máy chủ. Vui lòng thử lại.');
    } finally {
        if (submitUpgradeButton) {
            submitUpgradeButton.disabled = false;
            submitUpgradeButton.textContent = 'Xác nhận';
        }
    }
}

// --- Event Listeners and Initial Setup ---

// Event listener for "THANH TOÁN" buttons
document.querySelectorAll('.buy-button').forEach(button => {
    button.addEventListener('click', function() {
        const pricingCard = this.closest('.pricing-card');
        
        // Populate currentPaymentData directly
        currentPaymentData.planName = pricingCard.dataset.plan;
        currentPaymentData.amount = parseInt(pricingCard.dataset.price); 

        // Lưu thông tin gói vào localStorage (để dùng sau khi Discord login nếu cần)
        localStorage.setItem('pendingPlanName', currentPaymentData.planName);
        localStorage.setItem('pendingPlanPrice', currentPaymentData.amount.toString());

        showPaymentModal();
    });
});

document.addEventListener('DOMContentLoaded', async () => {
    // createParticles(); 
    loadDiscordUserDataFromStorage(); 
    updateLoginUI(); 

    const urlParams = new URLSearchParams(window.location.search);
    const discordUserParam = urlParams.get('discord_user'); 
    const error = urlParams.get('error');

    if (discordUserParam) {
        try {
            console.log('Detected Discord OAuth code, fetching user info...');
            const userData = JSON.parse(decodeURIComponent(discordUserParam));
            discordUserData = userData; 
            localStorage.setItem('discordUserData', JSON.stringify(discordUserData)); 
            updateLoginUI(); 

            const pendingPlanName = localStorage.getItem('pendingPlanName');
            const pendingPlanPrice = localStorage.getItem('pendingPlanPrice');

            if (pendingPlanName && pendingPlanPrice) {
                // Restore pending payment data to currentPaymentData
                currentPaymentData.planName = pendingPlanName;
                currentPaymentData.amount = parseInt(pendingPlanPrice);
                
                localStorage.removeItem('pendingPlanName'); 
                localStorage.removeItem('pendingPlanPrice');
                showPaymentModal(); 
            } else {
                alert(`Chào mừng, ${discordUserData.global_name || discordUserData.username}! Bạn đã đăng nhập thành công.`);
            }
        } catch (parseError) {
            console.error('Lỗi khi phân tích dữ liệu người dùng Discord từ URL:', parseError);
            alert('Lỗi khi xử lý dữ liệu Discord. Vui lòng thử lại.');
        } finally {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    } else if (error) {
        alert('Lỗi Discord OAuth: ' + error);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});

// Add event listener for when the modal is closed via the escape key
document.addEventListener('keydown', function(event) {
    if (event.key === "Escape") {
        if (document.getElementById('paymentModal').style.display === 'flex') {
            closePaymentModal();
        } else if (document.getElementById('successModal').style.display === 'flex') {
            closeSuccessModal();
        }
    }
});

// Mobile menu toggle
function toggleMobileMenu() {
    const navLinks = document.getElementById('navLinks');
    navLinks.classList.toggle('active');
}

// Intersection Observer for animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, observerOptions);

// Observe all fade-in elements
document.querySelectorAll('.fade-in').forEach(el => {
    observer.observe(el);
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
        document.getElementById('navLinks').classList.remove('active');
    });
});

// --- Particle Background Effect (Keeping existing code) ---
// Uncomment or remove if you use/don't use this feature
/*
function createParticles() {
    const numParticles = 50;
    const particlesContainer = document.querySelector('.particles');

    if (particlesContainer) {
        particlesContainer.innerHTML = ''; 
    } else {
        return; 
    }

    for (let i = 0; i < numParticles; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');
        particle.style.left = `${Math.random() * 100}vw`;
        particle.style.top = `${Math.random() * 100}vh`; 
        particle.style.animationDelay = `${Math.random() * 5}s`;
        particlesContainer.appendChild(particle);
        animateParticle(particle); 
    }
}

function animateParticle(particle) {
    const duration = 8 + Math.random() * 7; 
    const startY = Math.random() * 100;
    const endY = startY - 100; 
    const startX = Math.random() * 100;
    const endX = startX + (Math.random() - 0.5) * 50; 

    particle.style.animation = 'none';
    void particle.offsetWidth; 
    
    particle.style.setProperty('--startY', `${startY}vh`);
    particle.style.setProperty('--endY', `${endY}vh`);
    particle.style.setProperty('--startX', `${startX}vw`);
    particle.style.setProperty('--endX', `${endX}vw`);

    particle.style.animation = `float ${duration}s infinite linear`;
}
*/
