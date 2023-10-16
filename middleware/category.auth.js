const CategoryModel = require('../models/category.model')

async function checkCategoryCreator(req,res,next) {
    try {
        const {_id} = req.user
        const categoryId = req.params.id

        if (!categoryId) {
            return res.status(400).json({success: false, message: 'Please provide category ID'})
        }
        
        const category = await CategoryModel.findById(categoryId)
        if (!category) {
            return res.status(404).json({success: false, message: 'Category not found'})
        }

        if (category.user_id !== _id) {
            return res.status(401).json({success: false, message: 'You are not authorized to perform this action'})
        }

        next()

    } catch (error) {
        res.status(500).json({success: false, error: error.message})
    }
}

module.exports = {
    checkCategoryCreator
}