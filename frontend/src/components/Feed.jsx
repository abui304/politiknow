import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Post from './Post.jsx';

const Feed = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/posts');
        setPosts(response.data);
      } catch (err) {
        setError('Failed to fetch posts. Fix backend.');
        console.error("API Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, []);

  if (loading) {
    return <div className="feed-container"><p>Loading feed...</p></div>;
  }

  if (error) {
    return <div className="feed-container"><p style={{ color: 'red' }}>{error}</p></div>;
  }
  return (
    <div className="feed-container">
      {posts.map(post => (
        // The data from MongoDB uses `_id` instead of `id`.
        // We pass the entire `post` object as a prop, which is cleaner.
        <Post key={post._id} postData={post} />
      ))}
    </div>
  );
}
export default Feed;