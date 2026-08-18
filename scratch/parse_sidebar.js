const fs = require('fs');
const html = fs.readFileSync('Banking_prototype_template.html', 'utf8');

// The HTML might be complex, but let's try to find a typical sidebar structure.
// Usually, sidebar links are inside an element with class containing 'sidebar' or '<aside>'
// Let's just try to find elements that look like nav links.
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const dom = new JSDOM(html);
const document = dom.window.document;

// Try to find the sidebar
const sidebars = document.querySelectorAll('aside, .sidebar, #sidebar');
let sidebarText = '';

if (sidebars.length > 0) {
    sidebarText = sidebars[0].textContent;
    
    // Let's extract the actual link texts clearly
    const links = sidebars[0].querySelectorAll('a, .nav-item, li');
    console.log("SIDEBAR ITEMS FOUND:");
    links.forEach(link => {
        const text = link.textContent.trim().replace(/\s+/g, ' ');
        if(text) console.log("- " + text);
    });
} else {
    console.log("Could not find aside or .sidebar. Falling back to all links that might be nav menus:");
    const links = document.querySelectorAll('.nav-link, .menu-item, a');
    links.forEach(link => {
        const text = link.textContent.trim().replace(/\s+/g, ' ');
        if(text && text.length < 30) console.log("- " + text);
    });
}
