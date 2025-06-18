import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
// import qrcode from 'qrcode'; // Giữ nguyên nếu bạn có thể dùng sau này, nhưng không dùng trong phần này

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Lấy các biến môi trường
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const DISCORD_WEBHOOK_URL_PAYMENT = process.env.DISCORD_WEBHOOK_URL_PAYMENT;
const DISCORD_WEBHOOK_URL_UPGRADE = process.env.DISCORD_WEBHOOK_URL_UPGRADE;

// VietQR config
const VIETQR_BANK_ID = process.env.VIETQR_BANK_ID;
const VIETQR_ACCOUNT_NUMBER = process.env.VIETQR_ACCOUNT_NUMBER;
const VIETQR_ACCOUNT_NAME = process.env.VIETQR_ACCOUNT_NAME;
// Đảm bảo biến này được đặt chính xác trong .env, ví dụ: VIETQR_TEMPLATE_ID=rhcr5HI
const VIETQR_TEMPLATE_ID = process.env.VIETQR_TEMPLATE_ID;
// VIETQR_BANK_NAME = process.env.VIETQR_TEMPLATE_NAME; // Có vẻ là typo, nếu không dùng có thể xóa

// Senpe (Sepay.vn) config
const SEPAY_API_TOKEN = process.env.SEPAY_API_TOKEN; // Lấy token mới từ .env
const SEPAY_ACCOUNT_NUMBER = '0336681304'; // Số tài khoản bạn muốn kiểm tra giao dịch
const SEPAY_CHECK_PAYMENT_URL = `https://my.sepay.vn/userapi/transactions/list?account_number=${SEPAY_ACCOUNT_NUMBER}&limit=5`;


// --- Discord OAuth2 Endpoints ---
app.get('/callback', async (req, res) => {
    const code = req.query.code;

    if (!code) {
        console.error('Missing authorization code in GET request.');
        return res.redirect(`/?error=${encodeURIComponent('Missing authorization code from Discord.')}`);
    }

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: DISCORD_REDIRECT_URI,
                scope: 'identify email'
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Failed to exchange code for token:', tokenResponse.status, errorText);
            return res.redirect(`/?error=${encodeURIComponent('Failed to get access token from Discord.')}`);
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // Use access token to get user info
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error('Failed to fetch user data:', userResponse.status, errorText);
            return res.redirect(`/?error=${encodeURIComponent('Failed to fetch Discord user data.')}`);
        }

        const userData = await userResponse.json();

        // Redirect back to client with user data
        res.redirect(`/?discord_user=${encodeURIComponent(JSON.stringify(userData))}`);

    } catch (error) {
        console.error('Error during Discord OAuth2 callback:', error);
        res.redirect(`/?error=${encodeURIComponent('Internal server error during Discord login.')}`);
    }
});

// --- API để tạo mã QR Code (ĐÃ SỬA: Tạo URL trực tiếp thay vì gọi API generate) ---
app.post('/api/get-qr-code', async (req, res) => {
    const { purpose, amount, addInfo, userId, planName } = req.body;

    console.log('Received QR request from frontend:');
    console.log(`  Purpose: ${purpose}`);
    console.log(`  Amount: ${amount}`);
    console.log(`  AddInfo: ${addInfo}`);
    console.log(`  UserId: ${userId}`);
    console.log(`  PlanName: ${planName}`);

    if (!purpose || !amount || !addInfo || !userId || !planName) {
        console.error('Server: Missing required fields in QR request.');
        return res.status(400).json({ success: false, message: 'Payment purpose, amount, addInfo, userId, and planName are required.' });
    }

    // Tạo transactionCode từ addInfo và purpose (giữ nguyên logic này)
    let transactionCode = addInfo;
    switch (purpose.toLowerCase()) {
        case 'tempvoice':
            transactionCode = `TV${addInfo}`;
            break;
        case 'minigame':
            transactionCode = `MG${addInfo}`;
            break;
        default:
            break;
    }

    try {
        // Mã hóa các tham số cho URL để đảm bảo an toàn và đúng định dạng
        const encodedAccountName = encodeURIComponent(VIETQR_ACCOUNT_NAME);
        const encodedAmount = encodeURIComponent(amount);
        const encodedAddInfo = encodeURIComponent(transactionCode); // Sử dụng transactionCode đã được thêm prefix

        // Xây dựng URL hình ảnh QR code trực tiếp theo cấu trúc bạn đã cung cấp
        // Đảm bảo VIETQR_TEMPLATE_ID trong .env có giá trị như 'rhcr5HI' nếu bạn muốn khớp với URL mẫu
        const qrCodeImageUrl = `https://api.vietqr.io/image/${VIETQR_BANK_ID}-${VIETQR_ACCOUNT_NUMBER}-${VIETQR_TEMPLATE_ID}.jpg?accountName=${encodedAccountName}&amount=${encodedAmount}&addInfo=${encodedAddInfo}`;

        // Gửi phản hồi về frontend
        res.json({
            success: true,
            qrCodeUrl: qrCodeImageUrl, // Đây là URL hình ảnh QR code trực tiếp
            transactionCode: transactionCode, // Gửi mã giao dịch đã tạo
            bankAccountNumber: VIETQR_ACCOUNT_NUMBER,
            bankName: VIETQR_BANK_ID, // Frontend có thể dùng ID này để ánh xạ ra tên ngân hàng đầy đủ
        });
    } catch (error) {
        console.error('Error constructing QR code URL:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ khi tạo URL QR.' });
    }
});

// --- API để kiểm tra thanh toán với Senpe (Sepay.vn) ---
app.post('/api/check-payment', async (req, res) => {
    const { amount, transactionCode } = req.body;

    // Lấy các biến môi trường cần thiết cho Senpe
    const SEPAY_API_TOKEN = process.env.SEPAY_API_TOKEN;
    const SEPAY_ACCOUNT_NUMBER = '0336681304'; // Số tài khoản cố định của bạn
    const SEPAY_CHECK_PAYMENT_URL = `https://my.sepay.vn/userapi/transactions/list?account_number=${SEPAY_ACCOUNT_NUMBER}&limit=5`; // Lấy 5 giao dịch gần nhất

    if (!amount || !transactionCode) {
        return res.status(400).json({ success: false, message: 'Số tiền và mã giao dịch là bắt buộc để kiểm tra thanh toán.' });
    }

    try {
        const senpeResponse = await fetch(SEPAY_CHECK_PAYMENT_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${SEPAY_API_TOKEN}`, // Sepay yêu cầu Bearer token
                'Content-Type': 'application/json'
            },
        });

        if (!senpeResponse.ok) {
            const errorText = await senpeResponse.text();
            console.error(`Lỗi Senpe API: ${senpeResponse.status} - ${errorText}`);
            return res.status(senpeResponse.status).json({ success: false, message: `Lỗi khi gọi Senpe API: ${senpeResponse.status} - ${errorText}` });
        }

        const senpeData = await senpeResponse.json();

        // Kiểm tra cấu trúc phản hồi từ Sepay
        if (senpeData && senpeData.transactions && Array.isArray(senpeData.transactions)) {
            // Dòng này là điểm mấu chốt: nó sẽ tìm giao dịch khớp đầu tiên
            const foundTransaction = senpeData.transactions.find(transaction => {
                const amountIn = parseFloat(transaction.amount_in); 
                const requiredAmount = parseFloat(amount);
                const isAmountMatch = amountIn >= requiredAmount; // Check >= số tiền

                const transactionContent = (transaction.transaction_content || transaction.description || transaction.comment || '').toLowerCase();
                const lowerCaseTransactionCode = transactionCode.toLowerCase().trim();
                const isContentMatch = transactionContent.includes(lowerCaseTransactionCode); // Check chứa nội dung
                return isAmountMatch && isContentMatch; // Trả về true nếu cả 2 điều kiện đúng
            });

            if (foundTransaction) { // Nếu tìm thấy (tức là có 1 giao dịch khớp trong 5 cái)
                console.log('Thanh toán đã được xác nhận thành công:', foundTransaction);
                return res.json({ success: true, isPaid: true, message: 'Thanh toán đã được xác nhận thành công!' });
            } else { // Nếu không tìm thấy bất kỳ giao dịch nào khớp trong 5 cái
                console.log('Không tìm thấy giao dịch khớp hoặc thông tin không chính xác.');
                return res.json({ success: false, isPaid: false, message: 'Không tìm thấy giao dịch hoặc thông tin không khớp.' });
            }
        } else {
            console.error('Cấu trúc dữ liệu trả về từ Senpe API không như mong đợi:', senpeData);
            return res.status(500).json({ success: false, message: 'Cấu trúc dữ liệu trả về từ Senpe API không như mong đợi.' });
        }

    } catch (error) {
        console.error('Lỗi trong quá trình kiểm tra thanh toán Senpe:', error);
        let errorMessage = 'Lỗi máy chủ nội bộ khi kiểm tra thanh toán.';
        if (error.code === 'ENOTFOUND') {
            errorMessage = 'Không thể kết nối đến máy chủ Senpe. Vui lòng kiểm tra lại kết nối mạng hoặc tên miền API.';
        } else if (error.message.includes('failed')) {
            errorMessage = `Lỗi kết nối đến Senpe API: ${error.message}`;
        }
        res.status(500).json({ success: false, message: errorMessage });
    }
});


// --- Discord Webhook Endpoint ---
app.post('/api/submit-upgrade', async (req, res) => {
    const { userId, username, email, serverId, planName, amount, transactionCode } = req.body;

    // Kiểm tra dữ liệu đầu vào cơ bản
    if (!userId || !username || !serverId || !planName || !amount || !transactionCode) {
        console.error('Server: Thiếu các trường bắt buộc cho Discord Webhook.');
        return res.status(400).json({ success: false, message: 'Thiếu thông tin cần thiết để gửi yêu cầu.' });
    }

    const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL_UPGRADE;
const botghostWebhookUrl = process.env.BOTGHOST_WEBHOOK_URL;
const botghostApiKey = process.env.BOTGHOST_API;
const discordWebhookUrlServerId = process.env.DISCORD_WEBHOOK_URL_PAYMENT;

if (!discordWebhookUrl || discordWebhookUrl.includes('YOUR_WEBHOOK_URL_FOR_UPGRADE')) {
    console.error('Server: DISCORD_WEBHOOK_URL_UPGRADE chưa được cấu hình hoặc là placeholder.');
    return res.status(500).json({ success: false, message: 'URL Webhook cho yêu cầu nâng cấp chưa được cấu hình trên máy chủ.' });
}

const embed = {
    title: "PREMIUM LOGS",
    description: `> **Người dùng:** <@${userId}> (${username})`,
    color: 3066993,
    fields: [
    { name: "> Server ID", value: `**${serverId}**`, inline: false },
    { name: "> Gói Premium", value: `**${planName}**`, inline: true },
    { name: "> Số tiền", value: `**${amount} VND**`, inline: true },
    { name: "> Mã giao dịch", value: `**${transactionCode}**`, inline: false },
    { name: "> Email", value: `**${email || "Không cung cấp"}**`, inline: false }
],
    timestamp: new Date().toISOString(),
    footer: {
        text: "mxt Bot"
    }
};

// Payload chỉ gửi Server ID
const discordWebhookPayload = {
    content: `Server ID: ${serverId}`
};

// Payload gửi embed đầy đủ
const discordEmbedPayload = {
    embeds: [embed]
};

try {
    // Gửi webhook đầy đủ đến webhook riêng
    const embedResponse = await fetch(discordWebhookUrlServerId, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(discordEmbedPayload),
    });

    if (!embedResponse.ok) {
        const errorText = await embedResponse.text();
        console.error('Failed to send Discord Webhook (Embed):', embedResponse.status, errorText);
        return res.status(500).json({ success: false, message: `Lỗi khi gửi thông báo Discord: ${embedResponse.status} - ${errorText}` });
    }
    console.log('Webhook chứa embed đã gửi thành công.');

    // Gửi webhook chỉ có Server ID
    const idOnlyResponse = await fetch(discordWebhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(discordWebhookPayload),
    });

    if (!idOnlyResponse.ok) {
        const errorText = await idOnlyResponse.text();
        console.error('Failed to send Discord Webhook (Server ID only):', idOnlyResponse.status, errorText);
        return res.status(500).json({ success: false, message: `Lỗi khi gửi Server ID Discord: ${idOnlyResponse.status} - ${errorText}` });
    }
    console.log('Webhook chứa Server ID đã gửi thành công.');

    res.json({ success: true, message: 'Yêu cầu nâng cấp đã được xử lý và thông báo đã được gửi thành công!' });

} catch (error) {
    console.error('Lỗi trong endpoint submit-upgrade (catch chung):', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ khi xử lý yêu cầu nâng cấp.' });
}
});

// Serve the main HTML file for all other routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
// Start the server
app.listen(PORT, () => {
    console.log('\n==================== SERVER STARTED ====================');
    console.log(`🚀 Server is running at: http://localhost:${PORT}`);
    console.log('📢 Please ensure the following environment variables are properly set:');
    console.log('- DISCORD_CLIENT_ID');
    console.log('- DISCORD_CLIENT_SECRET');
    console.log('- REDIRECT_URI');
    console.log('- DISCORD_WEBHOOK_URL');
    console.log('- DISCORD_WEBHOOK_URL_UPGRADE');
    console.log('- DISCORD_WEBHOOK_URL_PAYMENT');
    console.log('- BOTGHOST_WEBHOOK_URL');
    console.log('- BOTGHOST_API');
    console.log('- VIETQR_BANK_ID');
    console.log('- VIETQR_ACCOUNT_NUMBER');
    console.log('- VIETQR_ACCOUNT_NAME');
    console.log('- VIETQR_TEMPLATE_ID');
    console.log('- SENPE_API_KEY or SEPAY_API_TOKEN');
    console.log('========================================================\n');
});
