const mongoose = require('mongoose');
const axios = require('axios');
const User = require('../models/user');
const Post = require('../models/post');
const { summarizeText } = require('../services/openaiService');

const getPartyEnum = (apiParty) => {
    if (apiParty === 'D') return 'dem';
    if (apiParty === 'R') return 'rep';
    if (apiParty === 'I' || apiParty === 'ID') return 'ind';
    return 'other';
}

const fetchAndPostBills = async () => {
    console.log('Starting bill fetch job...');
    
    try {
        // Step 1: Find our "bot" user in the database.
        // We assume this user has been created manually with the username 'GovTrackerBot'.
        const botUser = await User.findOne({ username: 'GovTrackerBot' });
        if (!botUser) {
            console.error('CRITICAL: The bot user "GovTrackerBot" was not found. Halting job.');
            return;
        }

        // Step 2: Fetch new bills from an external source.
        // This is a placeholder. You would replace this with a real API call.
        // For example, to the ProPublica API to get recent bills.
        // const response = await axios.get('https://api.propublica.org/congress/v1/...');
        console.log('Fetching bills from external source...');
        const fetchedBills = [
            // This is MOCK DATA for demonstration. A real API would provide this.
            { id: 'hr-123-118', title: 'National Donut Appreciation Act', text: 'This bill mandates that every Friday shall be national donut day, encouraging citizens to partake in delicious fried dough treats to boost morale and support local bakeries.', sponsor: { party: 'D' } },
            { id: 's-456-118', title: 'Universal Puppy Ownership Bill', text: 'To promote happiness and reduce stress, this bill provides a tax credit for any family that adopts a puppy. It also establishes national standards for puppy cuddliness.',  sponsor: { party: 'R' } },
            { id: 'hr-4350-117', title: 'National Defense Authorization Act for Fiscal Year 2022', text: 'This bill authorizes fiscal year 2022 appropriations for military activities and construction, and for defense activities of the Department of Energy.',  sponsor: { party: 'I' }} // A real example
        ];

        // Step 3: Process each fetched bill.
        for (const bill of fetchedBills) {
            // Step 3a: Check if we have already posted this bill.
            const existingPost = await Post.findOne({ sourceBillId: bill.id });

            if (existingPost) {
                console.log(`Skipping bill ${bill.id}, post already exists.`);
                continue; // Skip to the next bill
            }

            console.log(`Processing new bill: ${bill.title} (${bill.id})`);
            
            // Step 3b: If it's a new bill, summarize its text.
            const summary = await summarizeText(bill.text);

            // Step 3c: Create the new post in our database.
            const newPost = new Post({
                user: botUser._id, // The author is our bot
                billTitle: bill.title,
                originalText: bill.text,
                summary: summary,
                sourceBillId: bill.id,
                party: getPartyEnum(bill.sponsor.party),
            });

            await newPost.save();
            console.log(`Successfully created post for bill ${bill.id}`);
        }

        console.log('Bill fetch job finished.');
    } catch (error) {
        console.error('An error occurred during the bill fetch job:', error);
    }
}

module.exports = { fetchAndPostBills };