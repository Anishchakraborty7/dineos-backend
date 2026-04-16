const router = require('express').Router();
const ctrl = require('./restaurant.controller');
const auth = require('../../middleware/auth.middleware');
const role = require('../../middleware/role.middleware');
const tenant = require('../../middleware/tenant.middleware');

// ===================== SUPER ADMIN ONLY =====================
router.use(auth);

router.post('/', role('super_admin'), ctrl.createRestaurant);
router.get('/', role('super_admin'), ctrl.getRestaurants);
router.get('/:id', role('super_admin'), ctrl.getRestaurantById);
router.patch('/:id', role('super_admin'), ctrl.updateRestaurant);
router.delete('/:id', role('super_admin'), ctrl.deleteRestaurant);
router.post('/:id/regenerate-key', role('super_admin'), ctrl.regenerateApiKey);
router.post('/:id/features', role('super_admin'), ctrl.updateFeature);

// ===================== RESTAURANT ADMIN ONLY =====================
router.use(tenant);   // ← This is the important part

router.get('/me', ctrl.getMe);
router.get('/menu', ctrl.getMenu);
router.post('/menu', ctrl.createMenuItem);
router.patch('/menu/:id', ctrl.updateMenuItem);
router.delete('/menu/:id', ctrl.deleteMenuItem);

router.get('/orders', ctrl.getOrders);
router.patch('/orders/:id', ctrl.updateOrderStatus);

module.exports = router;