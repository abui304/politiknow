import React, { useState } from 'react';
import Post from './Post.jsx';

const mockPosts = [
  { id: 1, type: 'rep', content: 'This proposal seeks to maximize domestic energy production by fast-tracking permits for natural gas pipelines and oil drilling on federal lands. It couples this with a significant cut to the corporate tax rate (from 21% to 15%) to incentivize manufacturing and direct investment. Advocates claim it drives down consumer energy costs and restores American economic competitiveness. Environmental groups and climate advocates strongly oppose the deregulation and fossil fuel emphasis.', timestamp: Date.now() - 10800000, initialLikes: 0 },
  { id: 2, type: 'dem', content: 'Global regulators are struggling to harmonize approaches to Big Tech accountability. While some bodies push for aggressive antitrust action to break up monopolies and increase competition, others prefer targeted legislation focused on data privacy and content moderation standards. The lack of a unified front creates a complex, fragmented operating environment, allowing major platforms to exploit jurisdictional loopholes. The growing legislative pressure, fueled by public distrust and ethical concerns, signals a coming wave of mandates that will fundamentally alter the internet landscape, regardless of which party is in power.', timestamp: Date.now() - 7200000, initialLikes: 0 },
  { id: 3, type: 'dem', content: 'The debate over the $1.2 trillion infrastructure bill continues to hinge on defining "infrastructure." Progressive factions insist on expanding the scope to include "human capital," like subsidized childcare and education, arguing that a robust society is the foundation of a modern economy. Meanwhile, fiscal conservatives and centrist members prioritize traditional projects: roads, bridges, and broadband. The impasse risks delaying essential repairs and exposes deep divisions over the federal governments appropriate role in daily life and long-term societal investment. The final compromise will set the nations financial and philosophical direction for the next decade.', timestamp: Date.now() - 3600000, initialLikes: 0 },
  { id: 4, type: 'rep', content: 'A comprehensive immigration enforcement bill that allocates billions for fully completing the border wall system and mandates the nationwide use of the E-Verify system for all new hires, making it illegal for businesses to hire unauthorized workers. It also proposes hiring 20,000 new border patrol and ICE agents. Supporters argue it restores the rule of law and protects American jobs. Opponents cite humanitarian concerns and the potential economic disruption to agriculture and other industries.', timestamp: Date.now() - 10800000, initialLikes: 0 },
  { id: 5, type: 'dem', content: 'Legislation designed to restrict the influence of corporate and dark money in politics. Key provisions include mandatory real-time disclosure of all donations over $500, creation of a voluntary public financing system for federal elections, and overturning several Supreme Court precedents regarding political spending. The goal is to level the playing field for grassroots candidates. Critics argue it infringes on free speech rights and targets advocacy groups.', timestamp: Date.now() - 10800000, initialLikes: 0 },
  { id: 6, type: 'rep', content: 'Legislation promoting school voucher programs funded by federal tax credits, allowing parents to use public education funds for private schools, charter schools, or home-schooling expenses. It also includes measures to ban certain curriculum topics related to race and gender in public schools and establish a "Parents Bill of Rights." The intent is to increase competition and parental control. Critics warn it drains vital resources from public school systems.', timestamp: Date.now() - 10800000, initialLikes: 0 },
];

const Feed = () => {
  const [posts, setPosts] = useState(mockPosts);

  return (
    <div className="feed-container">
      {posts.map(post => (
        <Post 
          key={post.id} 
          content={post.content} 
          timestamp={post.timestamp}
          type={post.type}
          initialLikes={post.initialLikes} 
        />
      ))}
    </div>
  );
};

export default Feed;