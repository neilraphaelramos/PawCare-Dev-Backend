require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');

const initSocket = require('./socket');

const registerRoute = require('./controllers/registerController');
const checkUsernameRoute = require('./controllers/checkUsernameController');
const checkEmailRoute = require('./controllers/checkEmailController');
const verifyRoute = require('./controllers/verifyController');
const userDataRoute = require('./controllers/userDataController');
const addAccountRoute = require('./controllers/addAccountController');
const updateAccountAdminRoute = require('./controllers/updateAccountAdminController');
const loginRoute = require('./controllers/logincontroller');
const deleteAccountRoute = require('./controllers/deleteAccountController');
const updateProfileRoute = require('./controllers/updateProfileController');
const googleAuthRoute = require('./controllers/googleAuthController');
const onlineConsultationRoute = require('./controllers/onlineConsultationControllers');
const fetchPetRoute = require('./controllers/fetchPetController');
const serviceRoute = require('./controllers/serviceController');
const featureRoute = require('./controllers/featureController');
const inventoryRoute = require('./controllers/inventoryController');
const appointmentRoute = require('./controllers/appointmentController');
const petMedicalRecordsRoute = require('./controllers/petMedicalRecordController');
const orderRoute = require('./controllers/orderController');
const notificationRoute = require('./controllers/notificationController');
const announcementRoute = require('./controllers/announcementController');
const aiChatController = require('./AIChatController/aiChatController');
const metricDashboardRoute = require('./controllers/metricController');
const petInfosRoute = require('./controllers/petInfosController');
const reportsRoute = require('./controllers/reportsController');
const resetPasswordRoute = require('./controllers/resetPasswordController');
const consultMessageRoute = require('./controllers/consultMessagesController');
const receiptRoute = require('./controllers/receiptController');
const logsRoute = require('./controllers/logsController');

const app = express();
const server = http.createServer(app);

const io = initSocket(server);

app.use(cors({
  origin: process.env.DEFAULT_URL,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
//app.use('/uploads', express.static(path.join(__dirname, 'tmp/uploads')));

app.use('/register', registerRoute);
app.use('/check-username', checkUsernameRoute);
app.use('/check-email', checkEmailRoute);
app.use('/verify', verifyRoute);
app.use('/data', userDataRoute);
app.use('/add_account', addAccountRoute);
app.use('/update_account_admin', updateAccountAdminRoute);
app.use('/login', loginRoute);
app.use('/delete_account', deleteAccountRoute);
app.use('/update_profile', updateProfileRoute);
app.use('/auth/google', googleAuthRoute);
app.use('/online_consult', onlineConsultationRoute);
app.use('/fetch_pet', fetchPetRoute);
app.use('/services', serviceRoute);
app.use('/feature', featureRoute);
app.use('/inventory', inventoryRoute);
app.use('/appointments', appointmentRoute);
app.use('/pet_medical_records', petMedicalRecordsRoute);
app.use('/orders', orderRoute);
app.use('/notifications', notificationRoute);
app.use('/announcements', announcementRoute);
app.use('/ask-ai', aiChatController);
app.use('/metric_dashboard', metricDashboardRoute);
app.use('/pet_infos', petInfosRoute);
app.use('/reports', reportsRoute);
app.use('/reset-password-request', resetPasswordRoute);
app.use('/consult_messages', consultMessageRoute);
app.use('/order-receipt', receiptRoute);
app.use('/logs-vet', logsRoute);

const PORT = process.env.PORT;
server.listen(PORT, () => {
  console.log(`🚀 Server + Socket.IO running on port ${PORT}`);
});
