const DISCORD_CLIENT_ID = '1296801121146241085';
const DISCORD_SERVER_INVITE_URL = 'https://discord.gg/7Q8mzW4DGt';

let DISCORD_AUTH_URL = '';

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

function loadDiscordUserDataFromStorage() {
    const storedData = localStorage.getItem('discordUserData');
    if (storedData) {
        try {
            discordUserData = JSON.parse(storedData);
            console.log('Loaded Discord user data from localStorage:', discordUserData);
        } catch (e) {
            console.error('Error parsing stored Discord user data:', e);
            localStorage.removeItem('discordUserData');
            discordUserData = null;
        }
    }
}

function updateLoginUI() {
    const discordNavLoginBtnContainer = document.getElementById('discordNavLoginBtnContainer');
    const loggedInUserDisplay = document.getElementById('loggedInUserDisplay');
    const displayUsernameSpan = document.getElementById('displayUsername');
    const logoutNavBtn = document.getElementById('logoutNavBtn');
    const discordAvatarDisplay = document.getElementById('discordAvatarDisplay');

    if (discordUserData) {
        if (discordNavLoginBtnContainer) discordNavLoginBtnContainer.style.display = 'none';
        if (loggedInUserDisplay) loggedInUserDisplay.style.display = 'flex';

        if (displayUsernameSpan) {
            displayUsernameSpan.textContent = discordUserData.global_name || discordUserData.username || 'Người dùng Discord';
            if (discordUserData.discriminator && discordUserData.discriminator !== '0') {
                displayUsernameSpan.textContent += `#${discordUserData.discriminator}`;
            }
        }

        if (discordAvatarDisplay && discordUserData.id && discordUserData.avatar) {
            discordAvatarDisplay.src = `https://cdn.discordapp.com/avatars/${discordUserData.id}/${discordUserData.avatar}.png?size=32`;
        } else if (discordAvatarDisplay) {
            const defaultAvatarIndex = (discordUserData.discriminator === '0' || !discordUserData.discriminator)
                ? (discordUserData.id ? parseInt(discordUserData.id.slice(-5)) % 5 : 0)
                : parseInt(discordUserData.discriminator) % 5;
            discordAvatarDisplay.src = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png?size=32`;
        }

        if (logoutNavBtn) logoutNavBtn.onclick = logoutDiscord;
    } else {
        if (discordNavLoginBtnContainer) discordNavLoginBtnContainer.style.display = 'block';
        if (loggedInUserDisplay) loggedInUserDisplay.style.display = 'none';
    }
}

function logoutDiscord() {
    localStorage.removeItem('discordUserData');
    discordUserData = null;
    updateLoginUI();
    alert('Bạn đã đăng xuất khỏi Discord.');
    window.history.replaceState({}, '', window.location.pathname);
    closePaymentModal();
    closeSuccessModal();
}

function loginWithDiscord() {
    if (currentPaymentData.planName && currentPaymentData.amount) {
        localStorage.setItem('pendingPlanName', currentPaymentData.planName);
        localStorage.setItem('pendingPlanPrice', currentPaymentData.amount.toString());
    }
    if (DISCORD_AUTH_URL) {
        window.location.href = DISCORD_AUTH_URL;
    } else {
        alert('URL xác thực Discord chưa sẵn sàng. Vui lòng thử lại sau.');
    }
}

function joinDiscordServer() {
    window.open(DISCORD_SERVER_INVITE_URL, '_blank');
}

function generateRandomNumberString(length) {
    let result = '';
    const characters = '0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function generateShortTransferContent() {
    const randomNumPart = Math.floor(Math.random() * 0xFFFFFFFF);
    const randomBase36 = randomNumPart.toString(36);
    const transferContent = `Bố Minh`;
    return transferContent.toUpperCase();
}

async function showPaymentModal() {
    const modal = document.getElementById('paymentModal');
    modal.style.display = 'flex';

    document.getElementById('paymentStatusMessage').textContent = '';
    clearInterval(currentPaymentCountdownInterval);
    clearTimeout(paymentTimeout);
    clearInterval(paymentPollingInterval);

    const modalPlanNameDisplay = document.getElementById('modalPlanNameDisplay');
    if (modalPlanNameDisplay) modalPlanNameDisplay.textContent = currentPaymentData.planName;

    if (currentPaymentData.planName === 'CUSTOM') {
        document.getElementById('discordLoginSection').style.display = 'none';
        document.getElementById('paymentDetailsSection').style.display = 'none';
        document.getElementById('contactAdminMessage').style.display = 'block';
        document.getElementById('paymentCountdown').style.display = 'none';
        return;
    }

    if (discordUserData) {
        await showPaymentDetailsSection();
    } else {
        showDiscordLoginSection();
    }
}

function closePaymentModal() {
    const modal = document.getElementById('paymentModal');
    modal.style.display = 'none';
    clearInterval(currentPaymentCountdownInterval);
    clearTimeout(paymentTimeout);
    clearInterval(paymentPollingInterval);
    document.getElementById('paymentStatusMessage').textContent = '';

    localStorage.removeItem('pendingPlanName');
    localStorage.removeItem('pendingPlanPrice');

    document.getElementById('discordLoginSection').style.display = 'none';
    document.getElementById('paymentDetailsSection').style.display = 'none';
    document.getElementById('contactAdminMessage').style.display = 'none';
}

function openSuccessModal() {
    const modal = document.getElementById('successModal');
    modal.style.display = 'flex';
    
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
    document.getElementById('discordServerId').value = '';
}

function showDiscordLoginSection() {
    document.getElementById('discordLoginSection').style.display = 'block';
    document.getElementById('paymentDetailsSection').style.display = 'none';
    document.getElementById('contactAdminMessage').style.display = 'none';
    const loginDiscordBtn = document.querySelector('#paymentModal .discord-login-btn');
    if (loginDiscordBtn) {
        loginDiscordBtn.onclick = loginWithDiscord;
    }
    const joinDiscordBtn = document.querySelector('#paymentModal .join-discord-button');
    if (joinDiscordBtn) {
        joinDiscordBtn.style.display = 'inline-flex';
        joinDiscordBtn.textContent = 'Đăng nhập'; 
        joinDiscordBtn.onclick = loginWithDiscord;
    }
    document.getElementById('paymentCountdown').style.display = 'none';
}

async function showPaymentDetailsSection() {
    document.getElementById('discordLoginSection').style.display = 'none';
    document.getElementById('paymentDetailsSection').style.display = 'block';
    document.getElementById('contactAdminMessage').style.display = 'none';
    document.getElementById('paymentCountdown').style.display = 'block';

    const SPECIAL_USER_ID = "389350643090980869";
    if (discordUserData && discordUserData.id === SPECIAL_USER_ID) {
        console.log(`User ${discordUserData.global_name || discordUserData.username} (${discordUserData.id}) is a special user. Bypassing actual payment.`);

        currentPaymentData.transactionCode = generateShortTransferContent();

        clearInterval(currentPaymentCountdownInterval);
        clearTimeout(paymentTimeout);
        clearInterval(paymentPollingInterval);

        document.getElementById('paymentStatusMessage').textContent = 'Thanh toán thành công!';
        document.getElementById('paymentStatusMessage').style.color = '#00ff00';

        document.getElementById('paymentModal').style.display = 'none';
        openSuccessModal();
        alert(`Chào mừng, ${discordUserData.global_name || discordUserData.username}! Giao dịch của bạn đã được thanh toán tự động thành công.`);

        try {
            const response = await fetch('/api/log-simulated-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: discordUserData.id,
                    username: discordUserData.global_name || discordUserData.username,
                    planName: currentPaymentData.planName,
                    amount: currentPaymentData.amount,
                    transactionCode: currentPaymentData.transactionCode,
                    isSimulated: true,
                    discordUserData: discordUserData
                })
            });
            const data = await response.json();
            if (data.success) {
                console.log('Simulated payment logged successfully on server.');
            } else {
                console.error('Failed to log simulated payment on server:', data.message);
            }
        } catch (error) {
            console.error('Error sending simulated payment log to server:', error);
        }
        return;
    }

    document.getElementById('paymentDetailsPlanName').textContent = currentPaymentData.planName;
    document.getElementById('selectedPlanAmount').textContent = currentPaymentData.amount.toLocaleString('vi-VN');

    await generateVietQR();
    paymentStartTime = Date.now();
    startPaymentCountdownDisplay();
    startPaymentPolling();
}


async function generateVietQR() {
    if (!currentPaymentData.amount || !discordUserData || !discordUserData.id) {
        console.error('Missing payment or user data for QR generation.');
        alert('Vui lòng chọn gói và đăng nhập Discord trước.');
        closePaymentModal();
        return;
    }

    const addInfo = generateRandomNumberString(8);

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

            document.getElementById('displayBankAccountName').textContent = "NGUYEN THANH THUONG";
            document.getElementById('displayBankName').textContent = "MB Bank";

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

function startPaymentCountdownDisplay() {
    clearInterval(currentPaymentCountdownInterval);

    const countdownElement = document.getElementById('paymentCountdown');
    const totalDurationMs = 30 * 60 * 1000;
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
    }, 1000);
}

async function startPaymentPolling() {
    clearInterval(paymentPollingInterval);
    clearTimeout(paymentTimeout);

    const paymentStatusMessage = document.getElementById('paymentStatusMessage');
    paymentStatusMessage.textContent = 'Đang chờ bạn thanh toán...';
    paymentStatusMessage.style.color = '#00ffff';

    paymentTimeout = setTimeout(() => {
        clearInterval(paymentPollingInterval);
        clearInterval(currentPaymentCountdownInterval);
        paymentStatusMessage.textContent = 'Giao dịch đã hết hạn.';
        paymentStatusMessage.style.color = '#ff4444';
        alert('Đã hết thời gian chờ thanh toán. Vui lòng thử lại hoặc liên hệ hỗ trợ.');
        closePaymentModal();
    }, 30 * 60 * 1000);

    paymentPollingInterval = setInterval(async () => {
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
                    planName: currentPaymentData.planName,
                    discordUserData: discordUserData
                })
            });
            const data = await response.json();

            if (data.success && data.isPaid) {
                console.log('Payment successful!');
                clearInterval(paymentPollingInterval);
                clearInterval(currentPaymentCountdownInterval);
                clearTimeout(paymentTimeout);
                paymentStatusMessage.textContent = 'Thanh toán thành công! Đang xử lý yêu cầu của bạn...';
                paymentStatusMessage.style.color = '#00ff00';
                alert('Thanh toán thành công! Chúng tôi đang xử lý yêu cầu của bạn.');

                document.getElementById('paymentModal').style.display = 'none';
                openSuccessModal();

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
    }, 5000);
}
const submitUpgradeButton = document.querySelector('.submit-server-id-button');

async function submitUpgradeRequest() {
    const serverId = document.getElementById('discordServerId').value.trim();

    if (!serverId) {
        alert('Vui lòng nhập ID máy chủ Discord của bạn.');
        return;
    }

    if (!discordUserData || !discordUserData.id) {
        alert('Không tìm thấy thông tin người dùng Discord. Vui lòng đăng nhập lại.');
        return;
    }

    if (!currentPaymentData.transactionCode || !currentPaymentData.amount || !currentPaymentData.planName) {
        alert('Không tìm thấy thông tin giao dịch. Vui lòng thử lại quá trình thanh toán hoặc liên hệ hỗ trợ.');
        console.error('Lỗi: currentPaymentData bị thiếu trong submitUpgradeRequest', currentPaymentData);
        return;
    }

    if (submitUpgradeButton) {
        submitUpgradeButton.disabled = true;
        submitUpgradeButton.textContent = 'Đang gửi...';
    }

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
                transactionCode: currentPaymentData.transactionCode,
                discordUserData: discordUserData // Gửi toàn bộ object người dùng Discord
            })
        });
        const data = await response.json();

        if (data.success) {
            alert('Yêu cầu nâng cấp Premium đã được gửi thành công! Chúng tôi sẽ xử lý sớm nhất.');
            if (typeof closeSuccessModal === 'function') closeSuccessModal();

            currentPaymentData = { planName: null, amount: null, transactionCode: null };
            localStorage.removeItem('pendingPlanName');
            localStorage.removeItem('pendingPlanPrice');

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

document.querySelectorAll('.buy-button').forEach(button => {
    button.addEventListener('click', function() {
        const pricingCard = this.closest('.pricing-card');

        currentPaymentData.planName = pricingCard.dataset.plan;
        currentPaymentData.amount = parseInt(pricingCard.dataset.price);

        localStorage.setItem('pendingPlanName', currentPaymentData.planName);
        localStorage.setItem('pendingPlanPrice', currentPaymentData.amount.toString());

        showPaymentModal();
    });
});

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/discord-auth-url');
        const data = await response.json();
        if (data.authUrl) {
            DISCORD_AUTH_URL = data.authUrl;
            console.log('Discord Auth URL loaded from server.');
        } else {
            console.error('Failed to get Discord Auth URL from server.');
        }
    } catch (error) {
        console.error('Error fetching Discord Auth URL:', error);
    }

    loadDiscordUserDataFromStorage();
    updateLoginUI();

    const urlParams = new URLSearchParams(window.location.search);
    const discordUserParam = urlParams.get('discord_user');
    const error = urlParams.get('error');

    if (discordUserParam) {
        try {
            console.log('Detected Discord OAuth callback, parsing user info...');
            const userData = JSON.parse(decodeURIComponent(discordUserParam));
            discordUserData = userData;
            localStorage.setItem('discordUserData', JSON.stringify(discordUserData));
            updateLoginUI();

            const pendingPlanName = localStorage.getItem('pendingPlanName');
            const pendingPlanPrice = localStorage.getItem('pendingPlanPrice');

            if (pendingPlanName && pendingPlanPrice) {
                currentPaymentData.planName = pendingPlanName;
                currentPaymentData.amount = parseInt(pendingPlanPrice);

                localStorage.removeItem('pendingPlanName');
                localStorage.removeItem('pendingPlanPrice');
                await showPaymentModal(); // Chắc chắn modal được hiển thị đúng
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

document.addEventListener('keydown', function(event) {
    if (event.key === "Escape") {
        if (document.getElementById('paymentModal').style.display === 'flex') {
            closePaymentModal();
        } else if (document.getElementById('successModal').style.display === 'flex') {
            closeSuccessModal();
        }
    }
});

function toggleMobileMenu() {
    const navLinks = document.getElementById('navLinks');
    navLinks.classList.toggle('active');
}

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

document.querySelectorAll('.fade-in').forEach(el => {
    observer.observe(el);
});

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
