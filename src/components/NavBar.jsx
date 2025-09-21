import React from "react";
import "./NavBar.css";

export default function NavBar() {
    return (
        <nav className="navbar">
            <h1 className="logo">PolitiKnow</h1>
            <u1 className="nav-links">
                <li><a href="/profile">Profile</a></li>
                <li><a href="/home">Home</a></li>
                <li><a href="/search">Search</a></li>
                <li><a href="/settings">Settings</a></li>
            </u1>
        </nav>
    );
}