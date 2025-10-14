import React from "react";
import { Link } from 'react-router-dom';
import "./NavBar.css";

export default function NavBar() {
    return (
        <nav className="navbar">
            <Link className="logo" to="/home">
                <img src="/PolitiKnow.png" alt="PolitiKnow"></img>
            </Link>
            <ul className="nav-links">
                <li><Link to="/profile">Profile</Link></li>
                <li><Link to="/home">Home</Link></li>
                <li><Link to="/search">Search</Link></li>
                <li><Link to="/settings">Settings</Link></li>
            </ul>
        </nav>
    );
}