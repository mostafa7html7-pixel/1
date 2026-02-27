// --- Global Main Script ---

document.addEventListener('DOMContentLoaded', () => {

    // 1. Page Loader
    const pageLoader = document.getElementById('page-loader');
    if (pageLoader) {
        setTimeout(() => {
            pageLoader.classList.add('loader-hidden');
        }, 500); // Faster fade out
    }

    // 2. Menu Toggle
    const menuBtn = document.querySelector('.menu-btn');
    const navLinks = document.querySelector('.nav-links');
    if (menuBtn && navLinks) {
        menuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const icon = menuBtn.querySelector('i');
            if (icon) {
                // Toggling classes on the existing icon is more performant than re-writing innerHTML.
                if (navLinks.classList.contains('active')) {
                    icon.classList.replace('fa-bars', 'fa-xmark');
                } else {
                    icon.classList.replace('fa-xmark', 'fa-bars');
                }
            }
        });
    }

    // 3. PWA Install Button
    let deferredPrompt;
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
        if (!window.matchMedia('(display-mode: standalone)').matches) {
            installBtn.style.display = 'flex';
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.style.display = 'flex';
        });

        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') installBtn.style.display = 'none';
                deferredPrompt = null;
            } else {
                alert('لتثبيت التطبيق، يرجى استخدام خيار "الإضافة إلى الشاشة الرئيسية" من إعدادات المتصفح.');
            }
        });
    }

    // 4. Theme Toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const body = document.body;
        const icon = themeToggle.querySelector('i');

        if (localStorage.getItem('theme') === 'light') {
            body.classList.add('light-mode');
            icon.classList.replace('fa-moon', 'fa-sun');
        }

        themeToggle.addEventListener('click', () => {
            body.classList.toggle('light-mode');
            const isLight = body.classList.contains('light-mode');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            // Use classList.replace for safer and more consistent class manipulation
            if (isLight) {
                icon.classList.replace('fa-moon', 'fa-sun');
            } else {
                icon.classList.replace('fa-sun', 'fa-moon');
            }
        });
    }

    // 5. Scroll Animations
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    const animatedElements = document.querySelectorAll('.scroll-animate');
    animatedElements.forEach((el) => observer.observe(el));
});