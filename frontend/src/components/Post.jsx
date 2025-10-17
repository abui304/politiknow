import React, {useState} from 'react';
import './Post.css';

const MAX_LEN = 250; // char limit

const Post = ({ postData }) => {
    const { billTitle, summary, party, createdAt, likes } = postData;
    const [likeCount, setLikes] = useState(likes.length);
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
    if (party === 'dem') {
        activeColor = '#657fad';
    } else if (party === 'rep') {
        activeColor = '#ff6961';
    } else {
        activeColor = '#fae29c'
    }

    const shouldCut = summary.length > MAX_LEN;
    const displayedContent = shouldCut ? summary.substring(0, MAX_LEN) + '...' : summary;
    const postStyle = {
        '--post-color': `var(--color-${party}, var(--color-default))`, 
        '--voted-active-color': activeColor
    };

    const likesClass = likes > 0 ? 'likes-positive' : likes < 0 ? 'likes-negative' : 'likes-zero';
    const likeButtonClass = `like-button ${userVote === 'like' ? 'voted-active' : ''}`;
    const dislikeButtonClass = `dislike-button ${userVote === 'dislike' ? 'voted-active' : ''}`;

    return (
        <div className="post" style={postStyle}>
            <div className="post-header"> 
                <h3 className="post-title">{billTitle}</h3>
                <span className="post-timestamp">
                    {new Date(createdAt).toLocaleDateString()}
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
                        {likeCount}
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