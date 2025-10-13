import React, { useState } from 'react';
import Post from './Post.jsx';

const mockPosts = [
  { id: 1, type: 'dem', content: 'This is a Democratic bill. This is what it contains: Repealing big buzz words from the US government. Foreign affairs that have relations to other countries like other countries, in the metaphysical sense. I like democracy so I think that adding the functionality of hemorrhoid cream is valuable and should be invested.', timestamp: Date.now() - 3600000, initialLikes: 0 },
  { id: 2, type: 'dem', content: 'Another Democratic bill, this is about love. I think that our country should promote love. This AI would not say that. The concept of trade is so fascinating to me.', timestamp: Date.now() - 7200000, initialLikes: 0 },
  { id: 3, type: 'rep', content: 'This is a Republican bill. Can you tell? The color is red. Like it is red. Can you tell? I want to be impartial, so I am not sure what to say.', timestamp: Date.now() - 10800000, initialLikes: 0 },
];

const Feed = () => {
  const [posts, setPosts] = useState(mockPosts);

  return (
    <div className="feed-container">
      <h2>Latest Posts</h2>
      {}
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