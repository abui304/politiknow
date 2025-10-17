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
            { 
                id: 'hr-5376-117', 
                title: 'Inflation Reduction Act of 2022', 
                text: 'This bill aims to curb inflation by lowering prescription drug costs, promoting clean energy production through tax credits, and imposing a new minimum tax on large corporations. Key provisions include allowing Medicare to negotiate drug prices, investing billions in climate initiatives to reduce carbon emissions, and funding the IRS to increase tax enforcement. Supporters argue it lowers healthcare costs and combats climate change, while critics raise concerns about its potential impact on inflation and corporate investment.', 
                sponsor: { party: 'D' } 
            },
            { 
                id: 'hr-1-115', 
                title: 'Tax Cuts and Jobs Act of 2017', 
                text: 'This act represents a major overhaul of the U.S. tax code, significantly cutting the corporate tax rate from 35% to 21% and temporarily reducing individual income tax rates across most brackets. It also nearly doubles the standard deduction while limiting or eliminating others, such as the deduction for state and local taxes (SALT). Proponents claim the cuts stimulate economic growth and job creation, while opponents argue they disproportionately benefit corporations and the wealthy, leading to a significant increase in the national debt.', 
                sponsor: { party: 'R' } 
            },
            {
                id: 'hr-3590-111',
                title: 'Patient Protection and Affordable Care Act',
                text: 'Known as the ACA, this act overhauls the U.S. healthcare system. Its main goals are to increase the number of insured Americans and decrease the overall cost of healthcare. It achieves this through a combination of mandates, subsidies, and insurance exchanges. The law requires most individuals to have health insurance, offers tax credits to make insurance more affordable, expands the Medicaid program to cover more low-income adults, and supports innovative medical care delivery methods designed to lower the costs of health care generally.',
                sponsor: { party: 'D' }
            },
            {
                id: 'hr-1319-117',
                title: 'American Rescue Plan Act of 2021',
                text: 'This is a comprehensive COVID-19 relief package designed to address the continued economic and health-related impacts of the pandemic. It includes direct stimulus payments to individuals, an extension of federal unemployment benefits, funding for state and local governments, and resources for vaccination programs and school reopenings. The legislation also provides significant financial aid for small businesses and includes provisions for an expanded child tax credit.',
                sponsor: { party: 'D' }
            },
            {
                id: 'hr-5682-115',
                title: 'First Step Act',
                text: 'A bipartisan criminal justice reform bill that aims to reduce recidivism and decrease the federal prison population. It retroactively applies the Fair Sentencing Act of 2010 to reduce sentences for certain crack-cocaine offenses, expands job training and rehabilitative programs for inmates, and revises mandatory minimum sentencing laws. The act allows some federal inmates to earn early release to halfway houses or home confinement for good behavior.',
                sponsor: { party: 'R' }
            },
            {
                id: 'hr-3162-107',
                title: 'USA PATRIOT Act',
                text: 'Enacted shortly after the September 11th attacks, this act stands for "Uniting and Strengthening America by Providing Appropriate Tools Required to Intercept and Obstruct Terrorism." It significantly expanded the surveillance powers of U.S. law enforcement and intelligence agencies, allowing for increased wiretapping, monitoring of internet communications, and access to records. The goal was to enhance national security by improving information sharing and removing legal barriers to terrorism investigation.',
                sponsor: { party: 'R' }
            },
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