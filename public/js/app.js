// Whereami Duel Client-side JavaScript
const socket = io();

// Initialize Semantic UI components
$(document).ready(function() {
    // Initialize dropdowns
    $('.ui.dropdown').dropdown();
    
    // Initialize tabs
    $('.tabular.menu .item').tab();
    
    // Initialize progress bars
    $('.ui.progress').progress();
    
    // Auto-hide messages after 5 seconds
    $('.ui.message .close').click(function() {
        $(this).closest('.message').transition('fade');
    });
    
    setTimeout(function() {
        $('.ui.message:not(.permanent)').transition('fade');
    }, 5000);
});

// Socket.io event handlers
socket.on('connect', function() {
    console.log('🔌 Connected to Whereami Duel server');
});

socket.on('disconnect', function() {
    console.log('🔌 Disconnected from Whereami Duel server');
});

socket.on('duel_found', function(data) {
    console.log('🎮 Whereami Duel found:', data);
    // Handled in specific pages
});

socket.on('duel_updated', function(data) {
    console.log('🔄 Whereami Duel updated:', data);
    // Handled in specific pages
});

// Utility functions
function showNotification(message, type = 'info') {
    const notification = $(`
        <div class="ui ${type} message">
            <i class="close icon"></i>
            <div class="header">${message}</div>
        </div>
    `);
    
    $('body').prepend(notification);
    notification.transition('fade in');
    
    setTimeout(() => {
        notification.transition('fade out');
    }, 3000);
}

// Enhanced form handling
$('form').on('submit', function() {
    const submitButton = $(this).find('button[type="submit"]');
    submitButton.addClass('loading');
});

// Add some fun interactions for Whereami theme
$('.ui.button').hover(
    function() {
        if (!$(this).hasClass('loading')) {
            $(this).transition('pulse');
        }
    }
);

// Keyboard shortcuts for Whereami Duel
$(document).keydown(function(e) {
    // ESC to close modals or go back
    if (e.which === 27) {
        const modal = $('.ui.modal.active');
        if (modal.length) {
            modal.modal('hide');
        } else {
            const mapWrapper = $('#map-and-guess-wrapper');
            if (mapWrapper.length && !mapWrapper.hasClass('hidden')) {
                mapWrapper.addClass('hidden');
            }
        }
    }
    
    // M key to toggle map in duel
    if (e.which === 77 && !e.ctrlKey && !e.altKey) { // M key
        const mapWrapper = $('#map-and-guess-wrapper');
        if (mapWrapper.length) {
            mapWrapper.toggleClass('hidden');
        }
    }
    
    // Space to make guess (handled in duel page)
    if (e.code === 'Space' && $('#guess-button').length) {
        const guessButton = $('#guess-button');
        if (!guessButton.prop('disabled')) {
            e.preventDefault();
            guessButton.click();
        }
    }
});

// Google Maps related utilities
window.WhereamiDuel = {
    // Calculate distance between two points using Haversine formula
    calculateDistance: function(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },
    
    // Calculate score based on distance
    calculateScore: function(distance) {
        const maxDistance = 20037.5; // Half of Earth's circumference
        return Math.floor(5000 * Math.exp(-10 * (distance / maxDistance)));
    },
    
    // Format distance for display
    formatDistance: function(distance) {
        if (distance < 1) {
            return Math.round(distance * 1000) + ' m';
        } else if (distance < 1000) {
            return distance.toFixed(1) + ' km';
        } else {
            return Math.round(distance) + ' km';
        }
    },
    
    // Format score for display
    formatScore: function(score) {
        return score.toLocaleString('en-US');
    }
};

// Add celebration animation for wins
function celebrateWin() {
    const celebrations = ['🎉', '🎊', '🏆', '🌟', '🎯', '🗺️'];
    for (let i = 0; i < 10; i++) {
        setTimeout(() => {
            const celebration = $(`<div class="celebration">${celebrations[Math.floor(Math.random() * celebrations.length)]}</div>`);
            $('body').append(celebration);
            
            const startX = Math.random() * window.innerWidth;
            const startY = Math.random() * window.innerHeight;
            
            celebration.css({
                left: startX + 'px',
                top: startY + 'px',
                fontSize: (Math.random() * 2 + 1) + 'em'
            });
            
            celebration.animate({
                fontSize: '3em',
                opacity: 0,
                top: '-100px'
            }, 2000, function() {
                $(this).remove();
            });
        }, i * 200);
    }
}

// Enhanced error handling
window.addEventListener('error', function(e) {
    console.error('JavaScript error:', e.error);
    if (window.location.pathname.includes('/duel/')) {
        showNotification('An error occurred. Please refresh the page if the game doesn\'t work properly.', 'warning');
    }
});

// Performance optimization
$(window).on('beforeunload', function() {
    socket.disconnect();
    
    // Clear any active timers
    if (window.duelTimers) {
        Object.values(window.duelTimers).forEach(timer => {
            if (timer) clearInterval(timer);
        });
    }
});

// Service Worker registration for PWA capabilities (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registration successful');
            })
            .catch(function(err) {
                console.log('ServiceWorker registration failed');
            });
    });
}

// Initialize tooltips and help text
$(document).ready(function() {
    $('[data-tooltip]').each(function() {
        $(this).popup({
            content: $(this).data('tooltip'),
            variation: 'inverted'
        });
    });
});

// Add smooth scrolling for internal links
$('a[href^="#"]').on('click', function(event) {
    var target = $(this.getAttribute('href'));
    if (target.length) {
        event.preventDefault();
        $('html, body').stop().animate({
            scrollTop: target.offset().top - 100
        }, 1000);
    }
});

// Lazy loading for images (if any)
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                imageObserver.unobserve(img);
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// Network status monitoring
window.addEventListener('online', function() {
    showNotification('Connection restored! 🌐', 'success');
});

window.addEventListener('offline', function() {
    showNotification('Connection lost! Please check your internet. 📡', 'error');
});

// Game-specific utilities
window.WhereamiUtils = {
    // Generate random location within bounds
    generateRandomLocation: function(bounds = null) {
        const defaultBounds = {
            north: 85,
            south: -85,
            east: 180,
            west: -180
        };
        
        const b = bounds || defaultBounds;
        
        return {
            lat: Math.random() * (b.north - b.south) + b.south,
            lng: Math.random() * (b.east - b.west) + b.west
        };
    },
    
    // Check if location is valid for Street View
    isValidStreetViewLocation: function(lat, lng, callback) {
        if (!window.google || !window.google.maps) {
            callback(false);
            return;
        }
        
        const streetViewService = new google.maps.StreetViewService();
        streetViewService.getPanorama({
            location: { lat: lat, lng: lng },
            radius: 50000,
            source: 'outdoor'
        }, function(data, status) {
            callback(status === 'OK');
        });
    }
};

console.log('🎮 Whereami Duel client loaded! Ready for geographic adventures! 🗺️');
