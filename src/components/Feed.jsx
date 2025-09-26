import React, { useState } from 'react';
import Post from './Post.jsx';

const mockPosts = [
  { id: 1, type: 'dem', content: 'Excited about my new project!', timestamp: Date.now() - 3600000 },
  { id: 2, type: 'dem', content: 'Just finished a major sprint.', timestamp: Date.now() - 7200000 },
  { id: 3, type: 'rep', content: 'Learning about React components.Learning about React components.Learning about React components.Learning about React components.Learning about React components.Learning about React components.', timestamp: Date.now() - 10800000 },
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
        />
      ))}
    </div>
  );
};

export default Feed;