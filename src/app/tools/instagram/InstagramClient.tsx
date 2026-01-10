'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { css } from '@styled-system/css';
import { cx } from '@styled-system/css';
import type { InstagramSavedPost, InstagramLabel } from '@/types';
import PinEntryModal from '@/components/rehab/PinEntryModal';

interface InstagramClientProps {
  initialPosts: InstagramSavedPost[];
  initialLabels: InstagramLabel[];
}

export default function InstagramClient({ initialPosts, initialLabels }: InstagramClientProps) {
  const [posts, setPosts] = useState<InstagramSavedPost[]>(initialPosts);
  const [labels] = useState<InstagramLabel[]>(initialLabels);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [currentPostIndex, setCurrentPostIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [carouselIndices, setCarouselIndices] = useState<Map<string, number>>(new Map());
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/instagram/posts?archived=false&maxPosts=1', {
          credentials: 'include',
        });
        
        if (res.ok) {
          setIsAuthenticated(true);
        } else if (res.status === 401) {
          setIsAuthenticated(false);
          setShowPinModal(true);
        } else {
          setIsAuthenticated(false);
          setShowPinModal(true);
        }
      } catch {
        setIsAuthenticated(false);
        setShowPinModal(true);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);

  // Handle PIN success
  const handlePinSuccess = useCallback(() => {
    setIsAuthenticated(true);
    setShowPinModal(false);
    // Refresh posts after authentication
    fetch('/api/instagram/posts?archived=false', {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(data => {
        if (data.posts) {
          setPosts(data.posts);
        }
      })
      .catch(console.error);
  }, []);

  // Handle PIN cancel - don't allow canceling
  const handlePinCancel = useCallback(() => {
    // Don't allow canceling - user must authenticate
  }, []);

  // Filter and sort posts
  const filteredPosts = posts
    .filter(post => {
      if (selectedLabelId && !post.labels?.includes(selectedLabelId)) {
        return false;
      }
      if (!showArchived && (post.archived ?? false)) {
        return false;
      }
      if (showArchived && !(post.archived ?? false)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Sort by saved date (newest saved first)
      // importedAt represents the order posts were saved (newest saved first on Instagram)
      // This is the best proxy for saved date since Instagram doesn't provide it in the API
      const dateA = a.importedAt || a.savedAt || a.postedAt || '';
      const dateB = b.importedAt || b.savedAt || b.postedAt || '';
      if (dateA && dateB) {
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      }
      if (dateA) return -1;
      if (dateB) return 1;
      return 0;
    });

  // No automatic sync on mount - user must click refresh button

  // Handle video playback when post becomes active
  useEffect(() => {
    const currentPost = filteredPosts[currentPostIndex];
    if (!currentPost) return;

    // Pause all videos
    videoRefs.current.forEach((video) => {
      if (video) {
        video.pause();
      }
    });

    // Play current video if it's a video
    const carouselIndex = carouselIndices.get(currentPost.shortcode) || 0;
    const isCarousel = currentPost.isCarousel && currentPost.mediaItems && currentPost.mediaItems.length > 0;
    const currentMedia = isCarousel 
      ? currentPost.mediaItems?.[carouselIndex]
      : { isVideo: currentPost.isVideo, videoUrl: currentPost.videoUrl };
    
    if ((currentMedia?.isVideo && currentMedia?.videoUrl) || (currentPost.isVideo && currentPost.videoUrl)) {
      // Video refs are always stored with the carousel index suffix
      const videoKey = `${currentPost.shortcode}-${carouselIndex}`;
      const video = videoRefs.current.get(videoKey);
      if (video) {
        console.log('[Video] Auto-play check for', videoKey, 'isPlaying:', isPlaying, 'readyState:', video.readyState);
        
        // Always ensure video is loaded when post becomes active
        // This ensures the video starts loading immediately, not just on click
        if (video.readyState === 0) {
          // Video hasn't started loading yet - load it now
          video.load();
        }
        
        // Wait for video to be ready before playing
        const attemptPlay = () => {
          if (isPlaying && video.readyState >= 2) {
            video.play().catch((err) => {
              console.error('[Video] Auto-play failed:', err);
            });
          }
        };
        
        if (video.readyState >= 2) {
          // Video is already loaded - play immediately
          attemptPlay();
        } else {
          // Wait for video to load
          const canPlayHandler = () => {
            console.log('[Video] Can play for auto-play', videoKey);
            attemptPlay();
          };
          video.addEventListener('canplay', canPlayHandler, { once: true });
          video.addEventListener('loadedmetadata', canPlayHandler, { once: true });
        }
        video.muted = isMuted;
      } else {
        console.warn('[Video] Video element not found for auto-play:', videoKey);
      }
    }
  }, [currentPostIndex, filteredPosts, isPlaying, isMuted, carouselIndices]);

  // Handle scroll to snap to posts
  useEffect(() => {
    if (!containerRef.current || isScrolling) return;

    const handleScroll = () => {
      if (!containerRef.current) return;
      
      const container = containerRef.current;
      const scrollTop = container.scrollTop;
      const postHeight = window.innerHeight;
      const newIndex = Math.round(scrollTop / postHeight);
      
      if (newIndex !== currentPostIndex && newIndex >= 0 && newIndex < filteredPosts.length) {
        setCurrentPostIndex(newIndex);
      }
    };

    const container = containerRef.current;
    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [currentPostIndex, filteredPosts.length, isScrolling]);

  // Snap to current post index (only on programmatic changes, not scroll)
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const postHeight = window.innerHeight;
    const targetScroll = currentPostIndex * postHeight;
    const currentScroll = container.scrollTop;
    
    // Only snap if we're significantly off (more than 10% of screen height)
    if (Math.abs(currentScroll - targetScroll) > postHeight * 0.1) {
      setIsScrolling(true);
      container.scrollTo({
        top: targetScroll,
        behavior: 'smooth',
      });
      setTimeout(() => setIsScrolling(false), 500);
    }
  }, [currentPostIndex]);

  // Handle touch/swipe gestures for post navigation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
    setTouchStartX(e.touches[0].clientX);
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartY === null || touchStartX === null) return;

    const touchEndY = e.changedTouches[0].clientY;
    const touchEndX = e.changedTouches[0].clientX;
    const diffY = touchStartY - touchEndY;
    const diffX = touchStartX - touchEndX;
    const threshold = 50; // Minimum swipe distance

    const currentPost = filteredPosts[currentPostIndex];
    const isCarousel = currentPost?.isCarousel && currentPost?.mediaItems && currentPost.mediaItems.length > 1;
    const currentCarouselIndex = carouselIndices.get(currentPost?.shortcode || '') || 0;

    // If it's a carousel and horizontal swipe is larger, navigate carousel
    if (isCarousel && Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
      if (diffX > 0 && currentCarouselIndex < (currentPost.mediaItems?.length || 0) - 1) {
        // Swipe left - next carousel item
        setCarouselIndices(prev => new Map(prev).set(currentPost.shortcode, currentCarouselIndex + 1));
      } else if (diffX < 0 && currentCarouselIndex > 0) {
        // Swipe right - previous carousel item
        setCarouselIndices(prev => new Map(prev).set(currentPost.shortcode, currentCarouselIndex - 1));
      }
    } else if (Math.abs(diffY) > threshold) {
      // Vertical swipe - navigate posts
      if (diffY > 0 && currentPostIndex < filteredPosts.length - 1) {
        // Swipe up - next post
        setCurrentPostIndex(prev => prev + 1);
      } else if (diffY < 0 && currentPostIndex > 0) {
        // Swipe down - previous post
        setCurrentPostIndex(prev => prev - 1);
      }
    }

    setTouchStartY(null);
    setTouchStartX(null);
  }, [touchStartY, touchStartX, currentPostIndex, filteredPosts, carouselIndices]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' && currentPostIndex < filteredPosts.length - 1) {
        e.preventDefault();
        setCurrentPostIndex(prev => prev + 1);
      } else if (e.key === 'ArrowUp' && currentPostIndex > 0) {
        e.preventDefault();
        setCurrentPostIndex(prev => prev - 1);
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setIsMuted(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPostIndex, filteredPosts.length]);

  const syncPosts = useCallback(async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/instagram/posts/sync', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to sync posts');
      }

      await response.json();
      
      const postsResponse = await fetch('/api/instagram/posts?archived=false', {
        credentials: 'include',
      });
      if (postsResponse.ok) {
        const postsData = await postsResponse.json();
        setPosts(postsData.posts);
      }
    } catch (error) {
      console.error('Failed to sync posts:', error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _togglePostLabel = useCallback(async (shortcode: string, labelId: string) => {
    const post = posts.find(p => p.shortcode === shortcode);
    if (!post) return;

    const currentLabels = post.labels || [];
    const hasLabel = currentLabels.includes(labelId);
    const newLabels = hasLabel
      ? currentLabels.filter(l => l !== labelId)
      : [...currentLabels, labelId];

    try {
      const response = await fetch('/api/instagram/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ shortcode, labels: newLabels }),
      });

      if (!response.ok) {
        throw new Error('Failed to update post labels');
      }

      setPosts(prev =>
        prev.map(p =>
          p.shortcode === shortcode ? { ...p, labels: newLabels } : p
        )
      );
    } catch (error) {
      console.error('Failed to update post labels:', error);
    }
  }, [posts]);

  const handleVideoClick = useCallback((shortcode: string, carouselIndex?: number) => {
    const videoKey = carouselIndex !== undefined ? `${shortcode}-${carouselIndex}` : shortcode;
    const video = videoRefs.current.get(videoKey);
    console.log('[Video] Click handler called for', videoKey, 'video found:', !!video);
    if (video) {
      console.log('[Video] Current state - paused:', video.paused, 'readyState:', video.readyState, 'src:', video.src);
      if (video.paused) {
        // Ensure video is ready to play
        if (video.readyState >= 2) {
          console.log('[Video] Video ready, attempting to play');
          video.play().catch((error) => {
            console.error('[Video] Play error:', error);
            // If video fails to play, try to load it first
            console.log('[Video] Reloading video and retrying');
            video.load();
            setTimeout(() => {
              video.play().catch((err) => {
                console.error('[Video] Retry play failed:', err);
              });
            }, 200);
          });
          setIsPlaying(true);
        } else {
          // Wait for video to be ready
          console.log('[Video] Video not ready, waiting for canplay');
          video.addEventListener('canplay', () => {
            console.log('[Video] Can play event fired, attempting to play');
            video.play().catch((err) => {
              console.error('[Video] Play failed after canplay:', err);
            });
            setIsPlaying(true);
          }, { once: true });
          video.load();
        }
      } else {
        console.log('[Video] Video is playing, pausing');
        video.pause();
        setIsPlaying(false);
      }
    } else {
      console.warn('[Video] Video element not found for key:', videoKey, 'Available keys:', Array.from(videoRefs.current.keys()));
    }
  }, []);

  const handleMuteToggle = useCallback(() => {
    setIsMuted(prev => {
      const newMuted = !prev;
      videoRefs.current.forEach((video) => {
        if (video) {
          video.muted = newMuted;
        }
      });
      return newMuted;
    });
  }, []);

  const archivePost = useCallback(async (shortcode: string) => {
    // Show confirmation prompt
    const confirmed = window.confirm('Are you sure you want to archive this post? You can unarchive it later from the filters menu.');
    if (!confirmed) return;

    try {
      const response = await fetch('/api/instagram/posts/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ shortcode, archived: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to archive post');
      }

      setPosts(prev =>
        prev.map(p =>
          p.shortcode === shortcode ? { ...p, archived: true } : p
        )
      );
    } catch (error) {
      console.error('Failed to archive post:', error);
      alert('Failed to archive post. Please try again.');
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _unarchivePost = useCallback(async (shortcode: string) => {
    try {
      const response = await fetch('/api/instagram/posts/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ shortcode, archived: false }),
      });

      if (!response.ok) {
        throw new Error('Failed to unarchive post');
      }

      setPosts(prev =>
        prev.map(p =>
          p.shortcode === shortcode ? { ...p, archived: false } : p
        )
      );
    } catch (error) {
      console.error('Failed to unarchive post:', error);
      alert('Failed to unarchive post. Please try again.');
    }
  }, []);

  // Don't render UI until authenticated
  if (isLoading) {
    return (
      <div className={css({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#050505',
        color: '#f5f5f5',
      })}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        {showPinModal && (
          <PinEntryModal
            onSuccess={handlePinSuccess}
            onCancel={handlePinCancel}
            verifyEndpoint="/api/rehab/verify-pin"
            pinFieldName="pin"
          />
        )}
      </>
    );
  }

  const containerStyle = css({
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    overflowY: 'scroll',
    overflowX: 'hidden',
    scrollSnapType: 'y mandatory',
    scrollBehavior: 'smooth',
    background: 'radial-gradient(circle at top, rgba(88, 166, 255, 0.15), transparent 55%) #050505',
    WebkitOverflowScrolling: 'touch',
  });

  const postContainerStyle = css({
    width: '100vw',
    height: '100vh',
    position: 'relative',
    scrollSnapAlign: 'start',
    scrollSnapStop: 'always',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    // Desktop support: center content and limit max width
    '@media (min-width: 768px)': {
      maxWidth: '600px',
      margin: '0 auto',
      width: '100%',
    },
    background: 'transparent',
  });

  const mediaContainerStyle = css({
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  });

  const imageStyle = css({
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    userSelect: 'none',
    touchAction: 'none',
  });

  const videoStyle = css({
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    userSelect: 'none',
    touchAction: 'none',
  });

  const controlsOverlayStyle = css({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '16px',
    pointerEvents: 'none',
    zIndex: 10,
  });

  const topControlsStyle = css({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
    pointerEvents: 'auto',
  });

  const bottomControlsStyle = css({
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
    pointerEvents: 'auto',
  });

  const buttonStyle = css({
    padding: '12px',
    borderRadius: '50%',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    color: '#f5f5f5',
    cursor: 'pointer',
    fontSize: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(12px)',
    transition: 'all 0.2s',
    _hover: {
      background: 'rgba(15, 23, 42, 0.8)',
      borderColor: 'rgba(148, 163, 184, 0.4)',
    },
    _active: {
      transform: 'scale(0.95)',
    },
  });

  const labelBadgeStyle = css({
    padding: '6px 12px',
    borderRadius: '20px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    color: '#f5f5f5',
    fontSize: '12px',
    fontWeight: '500',
    backdropFilter: 'blur(12px)',
    marginRight: '8px',
    marginBottom: '8px',
  });

  const authorStyle = css({
    fontSize: '16px',
    fontWeight: '600',
    color: '#f8fafc',
    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
  });

  const toolbarStyle = css({
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'auto',
  });

  const filterMenuStyle = css({
    position: 'fixed',
    top: '60px',
    right: '16px',
    zIndex: 100,
    background: 'rgba(15, 23, 42, 0.9)',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '12px',
    padding: '16px',
    minWidth: '200px',
    maxWidth: '300px',
    maxHeight: '70vh',
    overflowY: 'auto',
    backdropFilter: 'blur(12px)',
    display: showFilters ? 'flex' : 'none',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  });

  const filterMenuItemStyle = css({
    padding: '10px 14px',
    borderRadius: '8px',
    background: 'rgba(148, 163, 184, 0.1)',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    color: '#f5f5f5',
    cursor: 'pointer',
    fontSize: '14px',
    textAlign: 'left',
    transition: 'all 0.2s',
    _hover: {
      background: 'rgba(148, 163, 184, 0.2)',
      borderColor: 'rgba(148, 163, 184, 0.4)',
    },
  });

  const activeFilterItemStyle = css({
    background: 'rgba(88, 166, 255, 0.3)',
    borderColor: 'rgba(88, 166, 255, 0.5)',
    color: '#cbd5f5',
    _hover: {
      background: 'rgba(88, 166, 255, 0.4)',
      borderColor: 'rgba(88, 166, 255, 0.6)',
    },
  });

  return (
    <>
      {/* Mobile-first full-screen posts */}
      <div
        ref={containerRef}
        className={containerStyle}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {filteredPosts.map((post, index) => {
          const isActive = index === currentPostIndex;
          const carouselIndex = carouselIndices.get(post.shortcode) || 0;
          const isCarousel = post.isCarousel && post.mediaItems && post.mediaItems.length > 1;
          const currentMedia = isCarousel 
            ? post.mediaItems?.[carouselIndex]
            : { imageUrl: post.imageUrl, videoUrl: post.videoUrl, isVideo: post.isVideo };
          
          
          const videoRef = (el: HTMLVideoElement | null) => {
            if (el) {
              videoRefs.current.set(`${post.shortcode}-${carouselIndex}`, el);
            } else {
              videoRefs.current.delete(`${post.shortcode}-${carouselIndex}`);
            }
          };

          return (
            <div key={post.shortcode} className={postContainerStyle}>
              <div 
                className={mediaContainerStyle}
                style={{ cursor: currentMedia?.isVideo ? 'pointer' : 'default' }}
              >
                {isCarousel && post.mediaItems ? (
                  <>
                    {currentMedia?.isVideo && currentMedia.videoUrl ? (
                      <>
                        <video
                          ref={(el) => {
                            videoRef(el);
                            // If this is the active post, load the video immediately
                            if (el && isActive && currentMedia.videoUrl) {
                              // Ensure video loads immediately when active
                              if (el.readyState === 0) {
                                el.load();
                              }
                              // Try to play if ready
                              if (el.readyState >= 2 && isPlaying) {
                                el.play().catch(console.error);
                              }
                            }
                          }}
                          src={currentMedia.videoUrl}
                          poster={currentMedia.imageUrl}
                          className={videoStyle}
                          playsInline
                          muted={isMuted}
                          loop
                          preload={isActive ? "auto" : "metadata"}
                          controls={false}
                          style={{
                            display: 'block',
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleVideoClick(post.shortcode, carouselIndex);
                          }}
                          onLoadedMetadata={() => {
                            if (isActive && isPlaying) {
                              const video = videoRefs.current.get(`${post.shortcode}-${carouselIndex}`);
                              if (video) {
                                video.play().catch(console.error);
                              }
                            }
                          }}
                          onCanPlay={() => {
                            if (isActive && isPlaying) {
                              const video = videoRefs.current.get(`${post.shortcode}-${carouselIndex}`);
                              if (video) {
                                video.play().catch(console.error);
                              }
                            }
                          }}
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          onError={(e) => {
                            console.error('Video error:', e);
                            console.log('Video URL:', currentMedia.videoUrl);
                            console.log('Post:', post);
                          }}
                        />
                        {!isPlaying && isActive && (
                          <div 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleVideoClick(post.shortcode, carouselIndex);
                            }}
                            style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              fontSize: '64px',
                              color: '#f5f5f5',
                              textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                              pointerEvents: 'auto',
                              cursor: 'pointer',
                              zIndex: 5,
                              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))',
                            }}
                          >
                            ▶️
                          </div>
                        )}
                      </>
                    ) : (
                      currentMedia?.imageUrl && (
                        <Image
                          src={currentMedia.imageUrl}
                          alt={post.caption || 'Instagram post'}
                          fill
                          className={imageStyle}
                          priority={isActive}
                          unoptimized
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        />
                      )
                    )}
                    
                    {/* Carousel indicators */}
                    <div style={{
                      position: 'absolute',
                      bottom: '20px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      gap: '8px',
                      zIndex: 10,
                    }}>
                      {post.mediaItems.map((_, idx) => (
                        <div
                          key={idx}
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: idx === carouselIndex ? '#f5f5f5' : 'rgba(255,255,255,0.5)',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setCarouselIndices(prev => new Map(prev).set(post.shortcode, idx));
                          }}
                        />
                      ))}
                    </div>
                  </>
                ) : ((currentMedia?.isVideo && currentMedia.videoUrl) || (post.isVideo && post.videoUrl)) ? (
                  <>
                    <video
                      ref={(el) => {
                        videoRef(el);
                        // If this is the active post, load the video immediately
                        if (el && isActive && (currentMedia?.videoUrl || post.videoUrl)) {
                          // Ensure video loads immediately when active
                          if (el.readyState === 0) {
                            el.load();
                          }
                          // Try to play if ready
                          if (el.readyState >= 2 && isPlaying) {
                            el.play().catch(console.error);
                          }
                        }
                      }}
                      src={currentMedia?.videoUrl || post.videoUrl}
                      poster={currentMedia?.imageUrl || post.imageUrl}
                      className={videoStyle}
                      playsInline
                      muted={isMuted}
                      loop
                      preload={isActive ? "auto" : "metadata"}
                      controls={false}
                      style={{
                        display: 'block',
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const carouselIndex = carouselIndices.get(post.shortcode) || 0;
                        handleVideoClick(post.shortcode, isCarousel ? carouselIndex : undefined);
                      }}
                      onLoadedMetadata={() => {
                        console.log('[Video] Loaded metadata for', post.shortcode, 'URL:', currentMedia?.videoUrl || post.videoUrl);
                        if (isActive && isPlaying) {
                          const carouselIndex = carouselIndices.get(post.shortcode) || 0;
                          // Video refs are always stored with the carousel index suffix
                          const videoKey = `${post.shortcode}-${carouselIndex}`;
                          const video = videoRefs.current.get(videoKey);
                          if (video) {
                            console.log('[Video] Attempting to play', videoKey, 'readyState:', video.readyState);
                            video.play().catch((err) => {
                              console.error('[Video] Play failed:', err);
                              // Try loading first
                              video.load();
                              setTimeout(() => {
                                video.play().catch(console.error);
                              }, 100);
                            });
                          }
                        }
                      }}
                      onCanPlay={() => {
                        console.log('[Video] Can play', post.shortcode);
                        if (isActive && isPlaying) {
                          const carouselIndex = carouselIndices.get(post.shortcode) || 0;
                          // Video refs are always stored with the carousel index suffix
                          const videoKey = `${post.shortcode}-${carouselIndex}`;
                          const video = videoRefs.current.get(videoKey);
                          if (video) {
                            video.play().catch((err) => {
                              console.error('[Video] Play failed in onCanPlay:', err);
                            });
                          }
                        }
                      }}
                      onPlay={() => {
                        console.log('[Video] Playing', post.shortcode);
                        setIsPlaying(true);
                      }}
                      onPause={() => {
                        console.log('[Video] Paused', post.shortcode);
                        setIsPlaying(false);
                      }}
                      onError={(e) => {
                        console.error('[Video] Error for', post.shortcode, e);
                        console.log('[Video] Video URL:', currentMedia?.videoUrl || post.videoUrl);
                        console.log('[Video] Post data:', { 
                          shortcode: post.shortcode, 
                          isVideo: post.isVideo, 
                          videoUrl: post.videoUrl,
                          currentMediaVideoUrl: currentMedia?.videoUrl 
                        });
                      }}
                      onLoadStart={() => {
                        console.log('[Video] Load start for', post.shortcode);
                      }}
                    />
                    {!isPlaying && isActive && (
                      <div 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const carouselIndex = carouselIndices.get(post.shortcode) || 0;
                          handleVideoClick(post.shortcode, isCarousel ? carouselIndex : undefined);
                        }}
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          fontSize: '64px',
                          color: '#f5f5f5',
                          textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                          pointerEvents: 'auto',
                          cursor: 'pointer',
                          zIndex: 5,
                          filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))',
                        }}
                      >
                        ▶️
                      </div>
                    )}
                  </>
                ) : (
                  currentMedia?.imageUrl && (
                    <Image
                      src={currentMedia.imageUrl}
                      alt={post.caption || 'Instagram post'}
                      fill
                      className={imageStyle}
                      priority={isActive}
                      unoptimized
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    />
                  )
                )}

                {/* Controls overlay */}
                <div className={controlsOverlayStyle}>
                  <div className={topControlsStyle}>
                    <div style={{ flex: 1 }}>
                      {post.authorUsername && (
                        <div className={authorStyle}>@{post.authorUsername}</div>
                      )}
                      {post.labels && post.labels.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '8px' }}>
                          {post.labels.map(labelId => {
                            const label = labels.find(l => l.id === labelId);
                            return label ? (
                              <span key={labelId} className={labelBadgeStyle}>
                                {label.name}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>
                    {((currentMedia?.isVideo && currentMedia.videoUrl) || (post.isVideo && post.videoUrl)) && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={handleMuteToggle}
                          className={buttonStyle}
                          aria-label={isMuted ? 'Unmute' : 'Mute'}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                        >
                          {isMuted ? '🔇' : '🔊'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className={bottomControlsStyle}>
                    {post.caption && (
                      <div style={{
                        padding: '12px',
                        borderRadius: '8px',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        color: '#f5f5f5',
                        fontSize: '14px',
                        backdropFilter: 'blur(12px)',
                        maxHeight: '150px',
                        overflowY: 'auto',
                      }}>
                        {post.caption}
                      </div>
                    )}
                    
                    {/* Archive button - small and subtle */}
                    {!post.archived && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          archivePost(post.shortcode);
                        }}
                        className={css({
                          marginTop: '4px',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          background: 'rgba(148, 163, 184, 0.1)',
                          border: '1px solid rgba(148, 163, 184, 0.2)',
                          color: '#94a3b8',
                          fontSize: '11px',
                          fontWeight: '400',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          alignSelf: 'flex-end',
                          _hover: {
                            background: 'rgba(148, 163, 184, 0.2)',
                            borderColor: 'rgba(148, 163, 184, 0.3)',
                          },
                        })}
                        title="Archive post"
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar for filters and sync */}
      <div className={toolbarStyle}>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={buttonStyle}
          title="Filters"
        >
          🏷️
        </button>
        <button
          onClick={syncPosts}
          disabled={isSyncing}
          className={buttonStyle}
          title="Sync posts"
        >
          {isSyncing ? '⏳' : '🔄'}
        </button>
      </div>

      {/* Filter menu */}
      {showFilters && (
        <div className={filterMenuStyle}>
          <div style={{ color: '#f8fafc', fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
            Filters
          </div>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f5f5f5', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Show Archived</span>
          </label>

          <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.2)', paddingTop: '8px', marginTop: '4px' }}>
            <button
              onClick={() => {
                setSelectedLabelId(null);
                setShowFilters(false);
              }}
              className={cx(filterMenuItemStyle, !selectedLabelId && activeFilterItemStyle)}
            >
              All Posts
            </button>
            {labels.map(label => (
              <button
                key={label.id}
                onClick={() => {
                  setSelectedLabelId(label.id);
                  setShowFilters(false);
                }}
                className={cx(filterMenuItemStyle, selectedLabelId === label.id && activeFilterItemStyle)}
              >
                {label.name}
              </button>
            ))}
          </div>

          <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.2)', paddingTop: '8px', marginTop: '4px', fontSize: '12px', color: '#94a3b8' }}>
            {filteredPosts.length} of {posts.length} posts
          </div>
        </div>
      )}
      
      {/* PIN Modal */}
      {showPinModal && !isAuthenticated && (
        <PinEntryModal
          onSuccess={handlePinSuccess}
          onCancel={handlePinCancel}
          verifyEndpoint="/api/rehab/verify-pin"
          pinFieldName="pin"
        />
      )}
    </>
  );
}
