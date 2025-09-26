import React from "react";
import "./NavBar.css";

export default function NavBar() {
    return (
        <nav className="navbar">
            <a className="logo" href="/home"><img src="/PolitiKnow.png" alt="PolitiKnow"></img></a>
            <ul className="nav-links">
                <li><a href="/profile">Profile</a></li>
                <li><a href="/home">Home</a></li>
                <li><a href="/search">Search</a></li>
                <li><a href="/settings">Settings</a></li>
            </ul>
        </nav>
    );
}