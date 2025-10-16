import React, {useState} from 'react';
import './Post.css';

const MAX_LEN = 250; // char limit

const Post = ({ content, type, timestamp, initialLikes = 0 }) => {
    const [likes, setLikes] = useState(initialLikes);
    const [userVote, setUserVote] = useState(null);

    const handleLike = () => {
        if (userVote === 'like') {
            setLikes(prevScore => prevScore - 1);
            setUserVote(null);
        } else if (userVote === 'dislike') {
            setLikes(prevScore => prevScore + 2);
            setUserVote('like');
        } else {
            setLikes(prevScore => prevScore + 1);
            setUserVote('like');
        }
    }

    const handleDislike = () => {
        if (userVote === 'dislike') {
            setLikes(prevScore => prevScore + 1);
            setUserVote(null);
        } else if (userVote === 'like') {
            setLikes(prevScore => prevScore - 2);
            setUserVote('dislike');
        } else {
            setLikes(prevScore => prevScore - 1);
            setUserVote('dislike');
        }
    }

    let activeColor;
    if (type === 'dem') {
        activeColor = '#657fad';
    } else if (type === 'rep') {
        activeColor = '#ff6961';
        
    }

    const shouldCut = content.length > MAX_LEN;
    const displayedContent = shouldCut ? content.substring(0, MAX_LEN) + '...' : content;
    const postStyle = {
        '--post-color': `var(--color-${type}, var(--color-default))`, 
        '--voted-active-color': activeColor
    };

    const likesClass = likes > 0 ? 'likes-positive' : likes < 0 ? 'likes-negative' : 'likes-zero';
    const likeButtonClass = `like-button ${userVote === 'like' ? 'voted-active' : ''}`;
    const dislikeButtonClass = `dislike-button ${userVote === 'dislike' ? 'voted-active' : ''}`;

    return (
        <div className="post" style={postStyle}>
            <div className="post-header"> 
                <span className="post-timestamp">
                    {new Date(timestamp).toLocaleDateString()}
                </span>
                
            </div>
            <div className="post-body">
                <p className="summary">{displayedContent}</p>
                    {shouldCut && <span className="read-more">Read More</span>}
            </div>
            <div className="post-footer">
                <div className="post-reactions">
                    <button onClick={handleLike} className={likeButtonClass}>
                        ↑
                    </button>
                    <span className={`likes ${likesClass}`}>
                        {likes}
                    </span>
                    <button onClick={handleDislike} className={dislikeButtonClass}>
                        ↓
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Post;