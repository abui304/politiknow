// This file isolates all communication with the OpenAI API.

const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const summarizeText = async (text) => {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant designed to summarize legislative bills for a social media platform. Your summaries should be neutral, concise, and easy for a general audience to understand.",
                },
                {
                    role: "user",
                    content: 'Please summarize the following bill text: "${text}"'
                }
            ],
            // max_tokens: XXX (set Value)
            // temperature: 0.5, // lower value makes a more focused output
        });

        return response.choices[0].message.content.trim();

    } catch (error) {
        console.error("Error communicating with OpenAI API:", error);
        throw new Error("Failed to generate summary.");
    }
};

module.exports = {
    summarizeText,
};