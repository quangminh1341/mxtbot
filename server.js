import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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
const DISCORD_SCOPES = 'identify email'; // Biến này có thể được định nghĩa một lần
const DISCORD_WEBHOOK_URL_PAYMENT = process.env.DISCORD_WEBHOOK_URL_PAYMENT;
const DISCORD_WEBHOOK_URL_UPGRADE = process.env.DISCORD_WEBHOOK_URL_UPGRADE;

// VietQR config
const VIETQR_BANK_ID = process.env.VIETQR_BANK_ID;
const VIETQR_ACCOUNT_NUMBER = process.env.VIETQR_ACCOUNT_NUMBER;
const VIETQR_ACCOUNT_NAME = process.env.VIETQR_ACCOUNT_NAME;
const VIETQR_TEMPLATE_ID = process.env.VIETQR_TEMPLATE_ID;

// Sepay.vn config
const SEPAY_API_TOKEN = process.env.SEPAY_API_TOKEN;
const SEPAY_ACCOUNT_NUMBER = process.env.SEPAY_ACCOUNT_NUMBER || '0336681304'; // Nên lấy từ .env, nếu không có thì dùng mặc định
const SEPAY_CHECK_PAYMENT_URL = `https://my.sepay.vn/userapi/transactions/list?account_number=${SEPAY_ACCOUNT_NUMBER}&limit=10`; // Tăng limit để quét nhiều hơn

// --- Hàm chung để gửi Discord Webhook ---
async function sendDiscordWebhook(webhookUrl, embedData = null, content = null) {
    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks')) {
        console.warn('Server: Webhook URL chưa được cấu hình hợp lệ hoặc không phải Discord Webhook URL. Không thể gửi webhook.');
        return { success: false, message: 'Webhook URL chưa cấu hình hoặc không hợp lệ.' };
    }

    const payload = {};
    if (content) {
        payload.content = content;
    }
    // Chỉ thêm embeds nếu có embedData hợp lệ
    if (embedData && typeof embedData === 'object' && Object.keys(embedData).length > 0) {
        payload.embeds = [embedData];
    }

    // Nếu không có cả content và embeds, không gửi webhook
    if (!payload.content && (!payload.embeds || payload.embeds.length === 0)) {
        console.warn('Server: Payload webhook trống rỗng (không có content hoặc embed). Không gửi.');
        return { success: false, message: 'Payload webhook trống.' };
    }

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (response.ok) {
            console.log(`Server: Webhook gửi thành công đến ${webhookUrl}`);
            return { success: true };
        } else {
            const errorText = await response.text();
            console.error(`Server: Lỗi khi gửi webhook đến ${webhookUrl}: ${response.status} - ${errorText}`);
            return { success: false, message: `Lỗi Discord Webhook: ${response.status} - ${errorText}` };
        }
    } catch (error) {
        console.error(`Server: Lỗi mạng hoặc lỗi khác khi gửi webhook đến ${webhookUrl}:`, error);
        return { success: false, message: `Lỗi máy chủ khi gửi webhook: ${error.message}` };
    }
}

// --- Discord OAuth2 Endpoints ---
app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;

    if (!code) {
        console.error('Server: Thiếu mã ủy quyền trong yêu cầu GET.');
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
                redirect_uri: DISCORD_REDIRECT_URI, // Đảm bảo đúng biến môi trường
                scope: DISCORD_SCOPES
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Server: Không thể trao đổi mã lấy token:', tokenResponse.status, errorText);
            return res.redirect(`/?error=${encodeURIComponent('Failed to get access token from Discord.')}`);
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error('Server: Không thể lấy dữ liệu người dùng:', userResponse.status, errorText);
            return res.redirect(`/?error=${encodeURIComponent('Failed to fetch Discord user data.')}`);
        }

        const userData = await userResponse.json();

        res.redirect(`/?discord_user=${encodeURIComponent(JSON.stringify(userData))}`);

    } catch (error) {
        console.error('Server: Lỗi trong quá trình callback Discord OAuth2:', error);
        res.redirect(`/?error=${encodeURIComponent('Lỗi máy chủ nội bộ trong quá trình đăng nhập Discord.')}`);
    }
});

app.get('/api/discord-auth-url', (req, res) => {
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(DISCORD_SCOPES)}`;
    res.json({ authUrl: authUrl });
});

---

### API để tạo mã QR Code

app.post('/api/get-qr-code', async (req, res) => {
    const { purpose, amount, addInfo, userId, planName } = req.body;

    console.log('Server: Nhận yêu cầu QR từ frontend:');
    console.log(`  Mục đích: ${purpose}, Số tiền: ${amount}, Thông tin thêm: ${addInfo}, User ID: ${userId}, Gói: ${planName}`);

    if (!purpose || !amount || !addInfo || !userId || !planName) {
        console.error('Server: Thiếu các trường bắt buộc trong yêu cầu QR.');
        return res.status(400).json({ success: false, message: 'Mục đích, số tiền, thông tin thêm, userId và tên gói là bắt buộc.' });
    }

    // Kiểm tra các biến VietQR
    if (!VIETQR_BANK_ID || !VIETQR_ACCOUNT_NUMBER || !VIETQR_ACCOUNT_NAME || !VIETQR_TEMPLATE_ID) {
        console.error('Server: Thiếu cấu hình VietQR trong biến môi trường.');
        return res.status(500).json({ success: false, message: 'Thiếu cấu hình VietQR trên máy chủ.' });
    }

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
        const encodedAccountName = encodeURIComponent(VIETQR_ACCOUNT_NAME);
        const encodedAmount = encodeURIComponent(amount);
        const encodedAddInfo = encodeURIComponent(transactionCode);

        const qrCodeImageUrl = `https://api.vietqr.io/image/${VIETQR_BANK_ID}-${VIETQR_ACCOUNT_NUMBER}-${VIETQR_TEMPLATE_ID}.jpg?accountName=${encodedAccountName}&amount=${encodedAmount}&addInfo=${encodedAddInfo}`;

        res.json({
            success: true,
            qrCodeUrl: qrCodeImageUrl,
            transactionCode: transactionCode,
            bankAccountNumber: VIETQR_ACCOUNT_NUMBER,
            bankName: VIETQR_BANK_ID,
        });
    } catch (error) {
        console.error('Server: Lỗi khi tạo URL QR code:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ khi tạo URL QR.' });
    }
});

---

### API để kiểm tra thanh toán với Sepay.vn

app.post('/api/check-payment', async (req, res) => {
    const { amount, transactionCode, discordUserData, planName } = req.body; // Thêm discordUserData và planName

    if (!amount || !transactionCode) {
        return res.status(400).json({ success: false, message: 'Số tiền và mã giao dịch là bắt buộc để kiểm tra thanh toán.' });
    }

    // Kiểm tra biến Sepay API Token
    if (!SEPAY_API_TOKEN) {
        console.error('Server: Thiếu SEPAY_API_TOKEN trong biến môi trường.');
        return res.status(500).json({ success: false, message: 'API Token của Sepay chưa được cấu hình.' });
    }

    try {
        const senpeResponse = await fetch(SEPAY_CHECK_PAYMENT_URL, { // Sử dụng biến toàn cục
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${SEPAY_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
        });

        if (!senpeResponse.ok) {
            const errorText = await senpeResponse.text();
            console.error(`Server: Lỗi Senpe API: ${senpeResponse.status} - ${errorText}`);
            return res.status(senpeResponse.status).json({ success: false, message: `Lỗi khi gọi Senpe API: ${senpeResponse.status} - ${errorText}` });
        }

        const senpeData = await senpeResponse.json();

        if (senpeData && senpeData.transactions && Array.isArray(senpeData.transactions)) {
            const foundTransaction = senpeData.transactions.find(transaction => {
                const amountIn = parseFloat(transaction.amount_in);
                const requiredAmount = parseFloat(amount);
                const isAmountMatch = amountIn >= requiredAmount;

                const transactionContent = (transaction.transaction_content || transaction.description || transaction.comment || '').toLowerCase();
                const lowerCaseTransactionCode = transactionCode.toLowerCase().trim();
                const isContentMatch = transactionContent.includes(lowerCaseTransactionCode);
                return isAmountMatch && isContentMatch;
            });

            if (foundTransaction) {
                console.log('Server: Thanh toán đã được xác nhận thành công:', foundTransaction);

                // --- GỬI WEBHOOK THANH TOÁN THÀNH CÔNG TỚI KÊNH PAYMENT LOG ---
                let avatarUrl = '';
                if (discordUserData && discordUserData.id && discordUserData.avatar) {
                    avatarUrl = `https://cdn.discordapp.com/avatars/${discordUserData.id}/${discordUserData.avatar}.png?size=64`;
                } else {
                    const defaultAvatarIndex = (discordUserData && (discordUserData.discriminator === '0' || !discordUserData.discriminator))
                        ? (discordUserData.id ? parseInt(discordUserData.id.slice(-5)) % 5 : 0)
                        : (discordUserData ? parseInt(discordUserData.discriminator) % 5 : 0);
                    avatarUrl = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png?size=64`;
                }

                const paymentWebhookEmbed = {
                    title: "💰 Giao dịch Mua gói Đã xử lý",
                    description: `Một giao dịch mua gói dịch vụ đã được ghi nhận.`,
                    color: 65280, // Màu xanh lá cây cho thành công
                    fields: [
                        { name: "> 📦 Gói", value: `**${planName || 'N/A'}**`, inline: true },
                        { name: "> 💵 Số tiền", value: `**${amount.toLocaleString('vi-VN')} VND**`, inline: true },
                        { name: "> 🔑 Mã giao dịch", value: `**${transactionCode || 'N/A'}**`, inline: true },
                        { name: "> 👤 Người dùng", value: discordUserData ? `**${discordUserData.global_name || discordUserData.username}${discordUserData.discriminator === '0' || !discordUserData.discriminator ? '' : `#${discordUserData.discriminator}`} (ID: \`${discordUserData.id}\`)**` : '**Không xác định**', inline: false },
                        { name: "> ✅ Trạng thái", value: "**Thanh toán thành công**", inline: false }
                    ],
                    thumbnail: {
                        url: avatarUrl
                    },
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: "mxt Bot"
                    }
                };

                const webhookResult = await sendDiscordWebhook(DISCORD_WEBHOOK_URL_PAYMENT, paymentWebhookEmbed);
                if (!webhookResult.success) {
                    console.error('Server: Gửi webhook thanh toán thất bại:', webhookResult.message);
                }

                return res.json({ success: true, isPaid: true, message: 'Thanh toán đã được xác nhận thành công!' });
            } else {
                console.log('Server: Không tìm thấy giao dịch khớp hoặc thông tin không chính xác.');
                return res.json({ success: false, isPaid: false, message: 'Không tìm thấy giao dịch hoặc thông tin không khớp.' });
            }
        } else {
            console.error('Server: Cấu trúc dữ liệu trả về từ Senpe API không như mong đợi:', senpeData);
            return res.status(500).json({ success: false, message: 'Cấu trúc dữ liệu trả về từ Senpe API không như mong đợi.' });
        }

    } catch (error) {
        console.error('Server: Lỗi trong quá trình kiểm tra thanh toán Sepay:', error);
        let errorMessage = 'Lỗi máy chủ nội bộ khi kiểm tra thanh toán.';
        if (error.code === 'ENOTFOUND') {
            errorMessage = 'Không thể kết nối đến máy chủ Sepay. Vui lòng kiểm tra lại kết nối mạng hoặc tên miền API.';
        } else if (error.message.includes('failed')) {
            errorMessage = `Lỗi kết nối đến Sepay API: ${error.message}`;
        }
        res.status(500).json({ success: false, message: errorMessage });
    }
});

---

### API gửi yêu cầu nâng cấp (Webhook Upgrade)

app.post('/api/submit-upgrade', async (req, res) => {
    const { userId, username, email, serverId, planName, amount, transactionCode, discordUserData } = req.body;

    // Kiểm tra dữ liệu đầu vào cơ bản
    if (!userId || !username || !serverId || !planName || !amount || !transactionCode) {
        console.error('Server: Thiếu các trường bắt buộc cho yêu cầu nâng cấp.');
        return res.status(400).json({ success: false, message: 'Thiếu thông tin cần thiết để gửi yêu cầu nâng cấp.' });
    }

    if (!DISCORD_WEBHOOK_URL_UPGRADE) {
        console.error('Server: Webhook URL cho yêu cầu nâng cấp chưa được cấu hình.');
        return res.status(500).json({ success: false, message: 'URL Webhook nâng cấp chưa được cấu hình trên máy chủ.' });
    }

    // Xây dựng content đơn giản cho webhook Upgrade
    const upgradeContent = `Discord: <@${userId}> (${username})\nServerID: ${serverId}`;

    try {
        // GỬI WEBHOOK CHỈ CÓ CONTENT ĐẾN KÊNH UPGRADE LOG
        const upgradeWebhookResult = await sendDiscordWebhook(
            DISCORD_WEBHOOK_URL_UPGRADE,
            null, // Không gửi embedData cho webhook này
            upgradeContent // Chỉ gửi content
        );

        if (!upgradeWebhookResult.success) {
            console.error('Server: Lỗi khi gửi thông báo nâng cấp Discord (chỉ content):', upgradeWebhookResult.message);
            return res.status(500).json({ success: false, message: `Lỗi khi gửi thông báo nâng cấp Discord: ${upgradeWebhookResult.message}` });
        }
        console.log('Server: Webhook thông tin nâng cấp (chỉ content) đã gửi thành công.');

        res.json({ success: true, message: 'Yêu cầu nâng cấp đã được xử lý và thông báo đã được gửi thành công!' });

    } catch (error) {
        console.error('Server: Lỗi trong endpoint submit-upgrade (catch chung):', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ khi xử lý yêu cầu nâng cấp.' });
    }
});


// Serve the main HTML file for all other routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log('\n==================== SERVER STARTED ====================');
    console.log(`🚀 Server is running at: http://localhost:${PORT}`);
    console.log('📢 Hãy đảm bảo các biến môi trường sau được thiết lập đúng cách:');
    console.log('- DISCORD_CLIENT_ID');
    console.log('- DISCORD_CLIENT_SECRET');
    console.log('- DISCORD_REDIRECT_URI'); // Đã sửa tên biến
    console.log('- DISCORD_WEBHOOK_URL_UPGRADE');
    console.log('- DISCORD_WEBHOOK_URL_PAYMENT');
    console.log('- VIETQR_BANK_ID');
    console.log('- VIETQR_ACCOUNT_NUMBER');
    console.log('- VIETQR_ACCOUNT_NAME');
    console.log('- VIETQR_TEMPLATE_ID');
    console.log('- SEPAY_API_TOKEN'); // Đã sửa tên biến
    console.log('- SEPAY_ACCOUNT_NUMBER');
    console.log('========================================================\n');
});
