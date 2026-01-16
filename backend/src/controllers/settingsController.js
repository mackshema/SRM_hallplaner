import Settings from '../models/Settings.js';

export const getSettings = async (req, res) => {
    try {
        const settings = await Settings.getSettings();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const updateSettings = async (req, res) => {
    try {
        const settings = await Settings.findOne();
        if (!settings) {
            // Should not happen due to getSettings logic but safe to handle
            const newSettings = await Settings.create(req.body);
            return res.json(newSettings);
        }

        Object.assign(settings, req.body);
        await settings.save();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
