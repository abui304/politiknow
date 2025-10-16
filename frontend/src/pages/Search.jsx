import React, { useState } from 'react'
import './Search.css';

function Search() {
    const [searchTerm, setSearchTerm] = useState('');

    const handleInputChange = (event) => {
        setSearchTerm(event.target.value);
    };

    const handleSearch = (event) => {
        event.preventDefault();
        // Start search API call here (whatever that means)
    }

  return (
    <div>
      <form onSubmit={handleSearch} className = "search-form">
        <input 
            type="text"
            placeholder="Search for a bill..."
            value={searchTerm}
            onChange={handleInputChange}
            className="search-input"
        />
        <button type="submit" className="search-button">
            Search
        </button>
      </form>
    </div>
  )
}

export default Search