const OrderModel = require("../models/order.model");
const debeerandomgen = require('debeerandomgen')
const validateData = require("../utils/validate");
const { empty } = require("../utils/helpers");
const PaymentModel = require("../models/payment.model");
const ProductModel = require("../models/product.model");
const UserModel = require("../models/user.model");
const { buildEmailTemplate, sendMail } = require("../utils/mail");

async function createOrder(req, res, next) {
    const user_id = req.user.id
    const {
        street_address,
        city,
        state,
        postal_code,
        phone_number,
        alternate_phone_number,
        products,
        amount,
        currency,
        order_date,
        delivery_date,
        tx_ref,
        order_ref
    } = req.body;

    const validationRule = {
        street_address: "required|string",
        city: "required|string",
        state: "required|string",
        postal_code: "string",
        phone_number: "required|string",
        alternate_phone_number: "string",
        products: "required|array",
        amount: "required"
    };

    const validationMessage = {
        required: ":attribute is required",
        string: ":attribute must be a string",
        array: ":attribute must be an array"
    };

    const validateResult = validateData(req.body,validationRule,validationMessage);
    if (!validateResult.success) {
        return res.json(validateResult.data);
    }

    try {
        if (empty(user_id)) {
            return res.json({success: false, message: 'You are not logged in. Please login to make order'})
        }

        // generate unique timestamp and use last four digits; concatenate with randomnly generated string from debeerandomgen package to form unique order_ref
        const timestamp = Date.now().toString(36).slice(-4)

        const newOrder = new OrderModel({
            user_id,
            street_address,
            city,
            state,
            postal_code,
            phone_number,
            alternate_phone_number,
            products,
            amount,
            currency,
            order_date,
            delivery_date,
            tx_ref,
            order_ref: `${timestamp}${debeerandomgen(4)}`
        })

            await newOrder.save()

            // send mail on successful order creation
            const user = await UserModel.findById(user_id)
            const emailOption = {
                to: user.email,
                from: "Aphia",
                subject: "Order Created",
                html: await buildEmailTemplate("order_creation.ejs", newOrder),
            };
            await sendMail(emailOption, res);

            // res.json({success: true, message: 'Order created successfully'})
            req.order = newOrder
            next()

    } catch (error) {
        return res.json({success: false, error: error.message});
    }
}

async function getAllOrdersByUser(req, res) {
    try {
        const user_id = req.user.id
        
        if (empty(user_id)) {
            return res.json({success: false, message: 'You are not authorized to access this resource, Please login'})
        }
        const orders = await OrderModel.find({user_id}).select('-__v')

        if (empty(orders)) {
            return res.json({success: false, message: 'No order by user found'})
        }

        res.json({ success: true, message: orders })
    } catch (error) {
        res.json({success: false, error: error.message});
    }
}

async function getAnOrderByUser(req, res){
    try {
        const user_id = req.user.id
        const {orderId} = req.params
        if (empty(user_id)) {
            return res.json({success: false, message: 'You are not authorized to access this resource. Please login'})
        }

        if (empty(orderId)) {
            return res.json({success: false, message: 'Please provide Order ID'})
        }

        const order = await OrderModel.findById(orderId).select('-__v')
        if (empty(order)) {
            return res.json({success: false, message: 'Order is not found'})
        }

        if (order.user_id != user_id) {
            return res.json({success: false, message: 'You are not authorized to access this resource. Please login'})
        }

        res.json({ success: true, message: order })
    } catch (error) {
        res.json({success: false, error: error.message});
    }
}

async function getAllOrders(req, res) {
    try {
        const {status} = req.query
        if (empty(status)) {
            return res.json({success: false, message: 'Please provide the status for search'})
        }

        if (status == 'pending') {
            const orders = await OrderModel.find({completed: false}).select('-__v')

            if (empty(orders)) {
                return res.json({success: false, message: 'No pending order found'})
            }

            res.json({ success: true, message: orders })

        } else if (status == 'completed') {
            const orders = await OrderModel.find({completed: true}).select('-__v')

            if (empty(orders)) {
                return res.json({success: false, message: 'No completed order found'})
            }

            res.json({ success: true, message: orders })
        } else {

            return res.json({ success: false, message: 'Invalid status provided' });
        }

    } catch (error) {
        res.json({success: false, error: error.message});
    }   
}

async function deleteOrder (req, res) {
    try {
        // get id of logged-in user
        const userId = req.user.id
        // get order id from req.params
        const {orderId} = req.params
        
        if (empty(orderId)) {
            return res.json({success: false, message: 'Please provide Order ID'})
        }
        // check if order exists
        const order = await OrderModel.findById(orderId).select('-__v')
        if (empty(order)) {
            return res.json({success: false, message: 'Order is not found'})
        }
        // check if user is the one who made the order
        if (order.user_id != userId) {
            return res.json({success: false, message: 'You are not authorized to access this resource'})
        }
        // check the order's completed status and delete if false
        if (order.completed == false) {
            await PaymentModel.deleteMany({order_id: orderId})
            await OrderModel.findByIdAndDelete(orderId)
            return res.json({success: true, message: 'Order deleted successfully'})

        } else if (order.completed == true) {
            return res.json({success: false, message: 'You cannot delete a completed order'})
        }
    } catch (error) {
        res.json({success: false, error: error.message});
    }
}

async function markDelivered(req, res) {
    try {
    const {delivery_date, completed} = req.body
    const {orderId} = req.params

    const validationRule = {
        delivery_date: 'required',
        completed: 'required'
    };

    const validationMessage = {
        required: ":attribute is required"
    };

    const validateResult = validateData(req.body,validationRule,validationMessage);
    if (!validateResult.success) {
        return res.json(validateResult.data);
    }

        if (empty(orderId)) {
            return res.json({success: false, message: 'Please provide Order ID'})
        }

        const updatedOrder = await OrderModel.findByIdAndUpdate(orderId , {completed, delivery_date}, {new: true})
        if (empty(updatedOrder)) {
            return res.json({success: false, message: 'Order not found'})
        }

        res.json({success: true, message: `Order updated successfully`})
    } catch (error) {
        res.json({success: false, error: error.message})
    }
}

async function getAllOrdersForVendor(req, res) {
    try {
        const {id} = req.user
        const orders = await OrderModel.find()

        if (orders.length == 0) {
            return res.json({success: false, message: `No order present`})
        }

        const vendorOrders = []
        for (const order of orders) {
            const orderDetails = {}
            const order_id = order._id
            const completed = order.completed
            const date = order.order_date
            const productsArr = []
            
            for (const product of order.products) {
                const productDetails = await ProductModel.findById(product.product_id)
                
                if (productDetails.user_id != id) {
                    continue
                }
                
                const newDetails = {product_name: productDetails.name, quantity: product.quantity, price: product.price, category_id: productDetails.category_id, image: productDetails.images[0]}
                productsArr.push(newDetails)
                orderDetails.order_id = order_id
                orderDetails.products = productsArr
                orderDetails.completed = completed
                orderDetails.date = date
            }
            if (!orderDetails.products) {
                continue
            } else {
                vendorOrders.push(orderDetails)
            }
        }
        if (vendorOrders.length == 0) {
            return res.json({success: false, message: `You have no order for your products`})
        }
        res.json({success: true, message: vendorOrders})
    } catch (error) {
        res.json({success: false, error: error.message})
    }
}

module.exports = {
    markDelivered,
    createOrder,
    getAllOrdersByUser,
    getAllOrders,
    getAnOrderByUser,
    deleteOrder,
    getAllOrdersForVendor
}
