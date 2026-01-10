'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const [posts, setPosts] = useState<InstagramSavedPost[]>(initialPosts);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(
    searchParams.get('label') || null
  );
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
  const [labelPickerPostId, setLabelPickerPostId] = useState<string | null>(null);
  const [newLabelName, setNewLabelName] = useState('');
  const [labels, setLabels] = useState<InstagramLabel[]>(initialLabels);
  const [isDraggingScrollbar, setIsDraggingScrollbar] = useState(false);
  const scrollTrackRef = useRef<HTMLDivElement>(null);
  const userPausedRef = useRef(false); // Track if user manually paused
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

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

  // Handle label selection with URL persistence
  const handleLabelSelect = useCallback((labelId: string | null) => {
    setSelectedLabelId(labelId);
    setCurrentPostIndex(0); // Reset to first post when filtering
    
    // Update URL
    const params = new URLSearchParams(searchParams.toString());
    if (labelId) {
      params.set('label', labelId);
    } else {
      params.delete('label');
    }
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    router.push(newUrl, { scroll: false });
  }, [searchParams, router]);

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

  // Track the previous post index and video key to pause when leaving
  const prevPostIndexRef = useRef(currentPostIndex);
  const prevVideoKeyRef = useRef<string>('');

  // Handle video playback when post or carousel item becomes active
  useEffect(() => {
    const currentPost = filteredPosts[currentPostIndex];
    if (!currentPost) return;

    const carouselIndex = carouselIndices.get(currentPost.shortcode) || 0;
    const currentVideoKey = `${currentPost.shortcode}-${carouselIndex}`;
    const postOrCarouselChanged = prevPostIndexRef.current !== currentPostIndex || 
                                   prevVideoKeyRef.current !== currentVideoKey;
    
    // Reset userPaused when switching to a new post (new post = fresh start)
    if (postOrCarouselChanged) {
      userPausedRef.current = false;
    }
    
    // ALWAYS pause ALL videos except the current one (defensive)
    videoRefs.current.forEach((video, key) => {
      if (video && key !== currentVideoKey && !video.paused) {
        video.pause();
        console.log('[Video] Paused non-active video:', key);
      }
    });
    
    // Update refs AFTER checking for changes
    prevPostIndexRef.current = currentPostIndex;
    prevVideoKeyRef.current = currentVideoKey;

    // Play current video if it's a video
    const isCarousel = currentPost.isCarousel && currentPost.mediaItems && currentPost.mediaItems.length > 0;
    const currentMedia = isCarousel 
      ? currentPost.mediaItems?.[carouselIndex]
      : { isVideo: currentPost.isVideo, videoUrl: currentPost.videoUrl };
    
    if ((currentMedia?.isVideo && currentMedia?.videoUrl) || (currentPost.isVideo && currentPost.videoUrl)) {
      const video = videoRefs.current.get(currentVideoKey);
      if (video) {
        // Always ensure video is loaded when post becomes active
        if (video.readyState === 0) {
          video.load();
        }
        
        video.muted = isMuted;
        
        // Auto-play when switching to a new post (always auto-play on post change)
        // This ensures videos play when scrolling, even if the previous video was paused
        if (postOrCarouselChanged) {
          const attemptPlay = () => {
            // Double-check we're still the active video before playing
            const stillActive = filteredPosts[currentPostIndex]?.shortcode === currentPost.shortcode;
            if (stillActive && video.readyState >= 2) {
              video.play().then(() => {
                setIsPlaying(true);
              }).catch((err) => {
                console.error('[Video] Auto-play failed:', err);
              });
            }
          };
          
          if (video.readyState >= 2) {
            attemptPlay();
          } else {
            video.addEventListener('canplay', attemptPlay, { once: true });
          }
        }
      }
    }
  }, [currentPostIndex, filteredPosts, isMuted, carouselIndices]);

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

  // Handle trackpad/wheel horizontal gestures for carousel navigation
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const currentPost = filteredPosts[currentPostIndex];
      if (!currentPost) return;
      
      const isCarousel = currentPost.isCarousel && currentPost.mediaItems && currentPost.mediaItems.length > 1;
      if (!isCarousel) return;
      
      const currentCarouselIndex = carouselIndices.get(currentPost.shortcode) || 0;
      const threshold = 30; // Minimum delta to trigger navigation
      
      // Only handle horizontal swipes
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > threshold) {
        e.preventDefault();
        
        if (e.deltaX > 0 && currentCarouselIndex < (currentPost.mediaItems?.length || 0) - 1) {
          // Swipe left (scroll right) - next carousel item
          setCarouselIndices(prev => new Map(prev).set(currentPost.shortcode, currentCarouselIndex + 1));
        } else if (e.deltaX < 0 && currentCarouselIndex > 0) {
          // Swipe right (scroll left) - previous carousel item
          setCarouselIndices(prev => new Map(prev).set(currentPost.shortcode, currentCarouselIndex - 1));
        }
      }
    };
    
    // Add wheel listener with passive: false to allow preventDefault
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [currentPostIndex, filteredPosts, carouselIndices]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const currentPost = filteredPosts[currentPostIndex];
      const isCarousel = currentPost?.isCarousel && currentPost?.mediaItems && currentPost.mediaItems.length > 1;
      const currentCarouselIndex = carouselIndices.get(currentPost?.shortcode || '') || 0;
      
      if (e.key === 'ArrowDown' && currentPostIndex < filteredPosts.length - 1) {
        e.preventDefault();
        setCurrentPostIndex(prev => prev + 1);
      } else if (e.key === 'ArrowUp' && currentPostIndex > 0) {
        e.preventDefault();
        setCurrentPostIndex(prev => prev - 1);
      } else if (e.key === 'ArrowRight' && isCarousel && currentCarouselIndex < (currentPost.mediaItems?.length || 0) - 1) {
        // Navigate carousel right
        e.preventDefault();
        setCarouselIndices(prev => new Map(prev).set(currentPost.shortcode, currentCarouselIndex + 1));
      } else if (e.key === 'ArrowLeft' && isCarousel && currentCarouselIndex > 0) {
        // Navigate carousel left
        e.preventDefault();
        setCarouselIndices(prev => new Map(prev).set(currentPost.shortcode, currentCarouselIndex - 1));
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
  }, [currentPostIndex, filteredPosts, carouselIndices]);

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

  const handleVideoClick = useCallback((shortcode: string, carouselIndex: number = 0) => {
    // Video refs are always stored with the carousel index suffix (e.g., "shortcode-0")
    const videoKey = `${shortcode}-${carouselIndex}`;
    const video = videoRefs.current.get(videoKey);
    console.log('[Video] Click handler called for', videoKey, 'video found:', !!video);
    if (video) {
      console.log('[Video] Current state - paused:', video.paused, 'readyState:', video.readyState, 'src:', video.src);
      if (video.paused) {
        // User is resuming playback
        userPausedRef.current = false;
        // Ensure video is ready to play
        if (video.readyState >= 2) {
          console.log('[Video] Video ready, attempting to play');
          video.play().then(() => {
            console.log('[Video] Play started successfully');
            setIsPlaying(true);
          }).catch((error) => {
            console.error('[Video] Play error:', error);
            // If video fails to play, try to load it first
            console.log('[Video] Reloading video and retrying');
            video.load();
            setTimeout(() => {
              video.play().then(() => {
                console.log('[Video] Retry play succeeded');
                setIsPlaying(true);
              }).catch((err) => {
                console.error('[Video] Retry play failed:', err);
              });
            }, 200);
          });
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
        // User is manually pausing
        console.log('[Video] Video is playing, pausing (user initiated)');
        userPausedRef.current = true;
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

  // Timeline seek handler
  const handleTimelineSeek = useCallback((clientX: number, shouldPlay: boolean = false) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    
    // Find the active video and seek
    const currentPost = filteredPosts[currentPostIndex];
    if (currentPost) {
      const carouselIndex = carouselIndices.get(currentPost.shortcode) || 0;
      const videoKey = `${currentPost.shortcode}-${carouselIndex}`;
      const video = videoRefs.current.get(videoKey);
      if (video && video.duration) {
        video.currentTime = percentage * video.duration;
        setVideoProgress(percentage * video.duration);
        
        // If video is paused and shouldPlay is true, start playback
        if (shouldPlay && video.paused) {
          userPausedRef.current = false;
          video.play().then(() => setIsPlaying(true)).catch(console.error);
        }
      }
    }
  }, [currentPostIndex, filteredPosts, carouselIndices]);

  const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingTimeline(true);
    handleTimelineSeek(e.clientX);
    
    const handleMouseMove = (e: MouseEvent) => {
      handleTimelineSeek(e.clientX);
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      setIsDraggingTimeline(false);
      // Play the video after seeking if it was paused
      handleTimelineSeek(e.clientX, true);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleTimelineSeek]);

  const handleTimelineTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingTimeline(true);
    const startX = e.touches[0].clientX;
    handleTimelineSeek(startX);
    
    let lastX = startX;
    const handleTouchMove = (e: TouchEvent) => {
      lastX = e.touches[0].clientX;
      handleTimelineSeek(lastX);
    };
    
    const handleTouchEnd = () => {
      setIsDraggingTimeline(false);
      // Play the video after seeking if it was paused
      handleTimelineSeek(lastX, true);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
    
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
  }, [handleTimelineSeek]);

  // Format time as mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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

  // Toggle a label on a post
  const toggleLabel = useCallback(async (shortcode: string, labelId: string) => {
    const post = posts.find(p => p.shortcode === shortcode);
    if (!post) return;

    const currentLabels = post.labels || [];
    const newLabels = currentLabels.includes(labelId)
      ? currentLabels.filter(id => id !== labelId)
      : [...currentLabels, labelId];

    try {
      const response = await fetch('/api/instagram/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ shortcode, labels: newLabels }),
      });

      if (!response.ok) {
        throw new Error('Failed to update labels');
      }

      setPosts(prev =>
        prev.map(p =>
          p.shortcode === shortcode ? { ...p, labels: newLabels } : p
        )
      );
    } catch (error) {
      console.error('Failed to update labels:', error);
    }
  }, [posts]);

  // Create a new label
  const createLabel = useCallback(async (name: string) => {
    console.log('[Labels] Creating label with name:', name);
    if (!name.trim()) {
      console.log('[Labels] Name is empty, returning');
      return;
    }

    try {
      console.log('[Labels] Sending POST request to /api/instagram/labels');
      const response = await fetch('/api/instagram/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to create label');
        return;
      }

      const { label } = await response.json();
      setLabels(prev => [...prev, label]);
      setNewLabelName('');
    } catch (error) {
      console.error('Failed to create label:', error);
    }
  }, []);

  // Scroll indicator handlers
  const calculateIndexFromPosition = useCallback((clientY: number) => {
    if (!scrollTrackRef.current || filteredPosts.length === 0) return 0;
    const rect = scrollTrackRef.current.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const percentage = Math.max(0, Math.min(1, relativeY / rect.height));
    return Math.round(percentage * (filteredPosts.length - 1));
  }, [filteredPosts.length]);

  const handleScrollbarInteraction = useCallback((clientY: number) => {
    const newIndex = calculateIndexFromPosition(clientY);
    if (newIndex !== currentPostIndex && newIndex >= 0 && newIndex < filteredPosts.length) {
      setCurrentPostIndex(newIndex);
      // Scroll to the post
      if (containerRef.current) {
        const postHeight = window.innerHeight;
        containerRef.current.scrollTo({
          top: newIndex * postHeight,
          behavior: 'auto', // instant for dragging
        });
      }
    }
  }, [calculateIndexFromPosition, currentPostIndex, filteredPosts.length]);

  const handleScrollbarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingScrollbar(true);
    handleScrollbarInteraction(e.clientY);
  }, [handleScrollbarInteraction]);

  const handleScrollbarTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsDraggingScrollbar(true);
    if (e.touches.length > 0) {
      handleScrollbarInteraction(e.touches[0].clientY);
    }
  }, [handleScrollbarInteraction]);

  // Handle drag events globally when dragging
  useEffect(() => {
    if (!isDraggingScrollbar) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleScrollbarInteraction(e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleScrollbarInteraction(e.touches[0].clientY);
      }
    };

    const handleEnd = () => {
      setIsDraggingScrollbar(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDraggingScrollbar, handleScrollbarInteraction]);

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
    paddingTop: 'max(16px, env(safe-area-inset-top))',
    paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
    paddingLeft: 'max(16px, env(safe-area-inset-left))',
    paddingRight: 'max(16px, env(safe-area-inset-right))',
    pointerEvents: 'none',
    zIndex: 10,
  });

  const topControlsStyle = css({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
    pointerEvents: 'auto',
    // Add right padding to avoid toolbar buttons on mobile
    paddingRight: '60px',
  });

  const bottomControlsStyle = css({
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
    pointerEvents: 'auto',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
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
    top: 'max(16px, env(safe-area-inset-top))',
    right: 'max(16px, env(safe-area-inset-right))',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'auto',
  });

  const filterMenuStyle = css({
    position: 'fixed',
    top: 'calc(max(16px, env(safe-area-inset-top)) + 52px)',
    right: 'max(16px, env(safe-area-inset-right))',
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
          
          
          const videoKey = `${post.shortcode}-${carouselIndex}`;
          const videoRef = (el: HTMLVideoElement | null) => {
            if (el) {
              videoRefs.current.set(videoKey, el);
              // Auto-play if this is the active post and video is ready
              // BUT respect user's manual pause
              if (isActive && el.readyState >= 2 && el.paused && !userPausedRef.current) {
                el.muted = isMuted;
                el.play().then(() => setIsPlaying(true)).catch(console.error);
              } else if (isActive && el.readyState < 2) {
                // Load and wait for canplay
                el.load();
              }
            } else {
              videoRefs.current.delete(videoKey);
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
                          ref={videoRef}
                          src={currentMedia.videoUrl}
                          poster={currentMedia.imageUrl}
                          className={videoStyle}
                          playsInline
                          muted={isMuted}
                          loop
                          preload={isActive ? "auto" : "none"}
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
                          onPlay={() => {
                            // Check actual current index, not stale closure
                            const currentActiveIndex = currentPostIndex;
                            if (index === currentActiveIndex) {
                              setIsPlaying(true);
                            } else {
                              // If a non-active video tries to play, pause it immediately
                              const video = videoRefs.current.get(`${post.shortcode}-${carouselIndex}`);
                              if (video) video.pause();
                            }
                          }}
                          onPause={() => {
                            const currentActiveIndex = currentPostIndex;
                            if (index === currentActiveIndex) {
                              setIsPlaying(false);
                            }
                          }}
                          onCanPlay={(e) => {
                            // Auto-play when video becomes ready if this is the active post
                            // BUT respect user's manual pause
                            const video = e.currentTarget;
                            if (isActive && video.paused && !userPausedRef.current) {
                              video.play().then(() => setIsPlaying(true)).catch(console.error);
                            }
                          }}
                          onTimeUpdate={(e) => {
                            if (isActive) {
                              setVideoProgress(e.currentTarget.currentTime);
                            }
                          }}
                          onLoadedMetadata={(e) => {
                            if (isActive) {
                              setVideoDuration(e.currentTarget.duration);
                            }
                          }}
                        />
                        {/* Video Timeline */}
                        {isActive && videoDuration > 0 && (
                          <div
                            ref={timelineRef}
                            className={css({
                              position: 'absolute',
                              bottom: '60px',
                              left: '16px',
                              right: '16px',
                              height: '24px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              zIndex: 15,
                              pointerEvents: 'auto',
                            })}
                          >
                            <span className={css({ color: '#fff', fontSize: '11px', fontWeight: '500', minWidth: '36px', textShadow: '0 1px 2px rgba(0,0,0,0.8)' })}>
                              {formatTime(videoProgress)}
                            </span>
                            <div
                              className={css({
                                flex: 1,
                                height: '6px',
                                background: 'rgba(255, 255, 255, 0.3)',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                position: 'relative',
                              })}
                              onMouseDown={handleTimelineMouseDown}
                              onTouchStart={handleTimelineTouchStart}
                            >
                              <div
                                className={css({
                                  position: 'absolute',
                                  left: 0,
                                  top: 0,
                                  height: '100%',
                                  background: 'rgba(255, 255, 255, 0.9)',
                                  borderRadius: '3px',
                                  transition: isDraggingTimeline ? 'none' : 'width 0.1s',
                                })}
                                style={{ width: `${(videoProgress / videoDuration) * 100}%` }}
                              />
                              <div
                                className={css({
                                  position: 'absolute',
                                  top: '50%',
                                  transform: 'translate(-50%, -50%)',
                                  width: '14px',
                                  height: '14px',
                                  background: '#fff',
                                  borderRadius: '50%',
                                  boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                                  transition: isDraggingTimeline ? 'none' : 'left 0.1s',
                                })}
                                style={{ left: `${(videoProgress / videoDuration) * 100}%` }}
                              />
                            </div>
                            <span className={css({ color: '#fff', fontSize: '11px', fontWeight: '500', minWidth: '36px', textAlign: 'right', textShadow: '0 1px 2px rgba(0,0,0,0.8)' })}>
                              {formatTime(videoDuration)}
                            </span>
                          </div>
                        )}
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
                      ref={videoRef}
                      src={currentMedia?.videoUrl || post.videoUrl}
                      poster={currentMedia?.imageUrl || post.imageUrl}
                      className={videoStyle}
                      playsInline
                      muted={isMuted}
                      loop
                      preload={isActive ? "auto" : "none"}
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
                        const idx = carouselIndices.get(post.shortcode) || 0;
                        handleVideoClick(post.shortcode, idx);
                      }}
                      onPlay={() => {
                        // Only update global state if this is the active video
                        const currentActiveIndex = currentPostIndex;
                        if (index === currentActiveIndex) {
                          setIsPlaying(true);
                        } else {
                          // If a non-active video tries to play, pause it immediately
                          const video = videoRefs.current.get(`${post.shortcode}-${carouselIndices.get(post.shortcode) || 0}`);
                          if (video) video.pause();
                        }
                      }}
                      onPause={() => {
                        // Only update global state if this is the active video
                        const currentActiveIndex = currentPostIndex;
                        if (index === currentActiveIndex) {
                          setIsPlaying(false);
                        }
                      }}
                      onCanPlay={(e) => {
                        // Auto-play when video becomes ready if this is the active post
                        // BUT respect user's manual pause
                        const video = e.currentTarget;
                        if (isActive && video.paused && !userPausedRef.current) {
                          video.play().then(() => setIsPlaying(true)).catch(console.error);
                        }
                      }}
                      onTimeUpdate={(e) => {
                        if (isActive) {
                          setVideoProgress(e.currentTarget.currentTime);
                        }
                      }}
                      onLoadedMetadata={(e) => {
                        if (isActive) {
                          setVideoDuration(e.currentTarget.duration);
                        }
                      }}
                    />
                    {/* Video Timeline */}
                    {isActive && videoDuration > 0 && (
                      <div
                        ref={timelineRef}
                        className={css({
                          position: 'absolute',
                          bottom: '60px',
                          left: '16px',
                          right: '16px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          zIndex: 15,
                          pointerEvents: 'auto',
                        })}
                      >
                        <span className={css({ color: '#fff', fontSize: '11px', fontWeight: '500', minWidth: '36px', textShadow: '0 1px 2px rgba(0,0,0,0.8)' })}>
                          {formatTime(videoProgress)}
                        </span>
                        <div
                          className={css({
                            flex: 1,
                            height: '6px',
                            background: 'rgba(255, 255, 255, 0.3)',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            position: 'relative',
                          })}
                          onMouseDown={handleTimelineMouseDown}
                          onTouchStart={handleTimelineTouchStart}
                        >
                          <div
                            className={css({
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              height: '100%',
                              background: 'rgba(255, 255, 255, 0.9)',
                              borderRadius: '3px',
                              transition: isDraggingTimeline ? 'none' : 'width 0.1s',
                            })}
                            style={{ width: `${(videoProgress / videoDuration) * 100}%` }}
                          />
                          <div
                            className={css({
                              position: 'absolute',
                              top: '50%',
                              transform: 'translate(-50%, -50%)',
                              width: '14px',
                              height: '14px',
                              background: '#fff',
                              borderRadius: '50%',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                              transition: isDraggingTimeline ? 'none' : 'left 0.1s',
                            })}
                            style={{ left: `${(videoProgress / videoDuration) * 100}%` }}
                          />
                        </div>
                        <span className={css({ color: '#fff', fontSize: '11px', fontWeight: '500', minWidth: '36px', textAlign: 'right', textShadow: '0 1px 2px rgba(0,0,0,0.8)' })}>
                          {formatTime(videoDuration)}
                        </span>
                      </div>
                    )}
                    {!isPlaying && isActive && (
                      <div 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const idx = carouselIndices.get(post.shortcode) || 0;
                          handleVideoClick(post.shortcode, idx);
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
                      {/* Active filter indicator */}
                      {selectedLabelId && index === currentPostIndex && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleLabelSelect(null);
                          }}
                          className={css({
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            marginBottom: '8px',
                            borderRadius: '20px',
                            background: 'rgba(88, 166, 255, 0.2)',
                            border: '1px solid rgba(88, 166, 255, 0.4)',
                            color: '#88a6ff',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            backdropFilter: 'blur(12px)',
                            transition: 'all 0.2s',
                            _hover: {
                              background: 'rgba(239, 68, 68, 0.2)',
                              borderColor: 'rgba(239, 68, 68, 0.4)',
                              color: '#ef4444',
                            },
                          })}
                        >
                          <span>🏷️ {labels.find(l => l.id === selectedLabelId)?.name}</span>
                          <span style={{ fontSize: '14px' }}>✕</span>
                        </button>
                      )}
                      {post.authorUsername && (
                        <div className={authorStyle}>@{post.authorUsername}</div>
                      )}
                      {post.labels && post.labels.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '8px', gap: '4px' }}>
                          {post.labels.map(labelId => {
                            const label = labels.find(l => l.id === labelId);
                            return label ? (
                              <button
                                key={labelId}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleLabelSelect(labelId);
                                }}
                                className={css({
                                  padding: '4px 10px',
                                  borderRadius: '16px',
                                  background: selectedLabelId === labelId 
                                    ? 'rgba(88, 166, 255, 0.3)' 
                                    : 'rgba(15, 23, 42, 0.6)',
                                  border: selectedLabelId === labelId
                                    ? '1px solid rgba(88, 166, 255, 0.6)'
                                    : '1px solid rgba(148, 163, 184, 0.2)',
                                  color: '#f5f5f5',
                                  fontSize: '12px',
                                  fontWeight: '500',
                                  backdropFilter: 'blur(12px)',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  _hover: {
                                    background: 'rgba(88, 166, 255, 0.2)',
                                    borderColor: 'rgba(88, 166, 255, 0.4)',
                                  },
                                })}
                                title={`Filter by ${label.name}`}
                              >
                                {label.name}
                              </button>
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
                    
                    {/* Post actions row */}
                    <div style={{ 
                      display: 'flex', 
                      gap: '8px', 
                      marginTop: '8px',
                      alignItems: 'flex-start',
                      position: 'relative',
                    }}>
                      {/* Label picker button */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setLabelPickerPostId(labelPickerPostId === post.shortcode ? null : post.shortcode);
                        }}
                        className={css({
                          padding: '6px 10px',
                          borderRadius: '6px',
                          background: post.labels && post.labels.length > 0 
                            ? 'rgba(88, 166, 255, 0.2)' 
                            : 'rgba(148, 163, 184, 0.1)',
                          border: post.labels && post.labels.length > 0
                            ? '1px solid rgba(88, 166, 255, 0.4)'
                            : '1px solid rgba(148, 163, 184, 0.2)',
                          color: post.labels && post.labels.length > 0 ? '#88a6ff' : '#94a3b8',
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          _hover: {
                            background: 'rgba(88, 166, 255, 0.3)',
                            borderColor: 'rgba(88, 166, 255, 0.5)',
                          },
                        })}
                        title="Add labels"
                      >
                        🏷️ {post.labels?.length || 0}
                      </button>

                      {/* Label picker dropdown */}
                      {labelPickerPostId === post.shortcode && (
                        <div 
                          className={css({
                            position: 'absolute',
                            bottom: '100%',
                            left: '0',
                            marginBottom: '8px',
                            background: 'rgba(15, 23, 42, 0.95)',
                            border: '1px solid rgba(148, 163, 184, 0.3)',
                            borderRadius: '12px',
                            padding: '12px',
                            minWidth: '200px',
                            maxWidth: '280px',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                            backdropFilter: 'blur(16px)',
                            zIndex: 100,
                          })}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ 
                            fontSize: '13px', 
                            fontWeight: '600', 
                            color: '#f8fafc', 
                            marginBottom: '10px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}>
                            <span>Labels</span>
                            <button
                              onClick={() => setLabelPickerPostId(null)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                fontSize: '16px',
                                padding: '0',
                              }}
                            >
                              ✕
                            </button>
                          </div>

                          {/* Existing labels */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                            {labels.map(label => {
                              const isSelected = post.labels?.includes(label.id);
                              return (
                                <button
                                  key={label.id}
                                  onClick={() => toggleLabel(post.shortcode, label.id)}
                                  className={css({
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    background: isSelected 
                                      ? 'rgba(88, 166, 255, 0.25)' 
                                      : 'rgba(148, 163, 184, 0.1)',
                                    border: isSelected
                                      ? '1px solid rgba(88, 166, 255, 0.5)'
                                      : '1px solid rgba(148, 163, 184, 0.2)',
                                    color: isSelected ? '#cbd5f5' : '#e2e8f0',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    textAlign: 'left',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    _hover: {
                                      background: isSelected 
                                        ? 'rgba(88, 166, 255, 0.35)' 
                                        : 'rgba(148, 163, 184, 0.2)',
                                    },
                                  })}
                                >
                                  <span style={{ 
                                    width: '18px', 
                                    height: '18px', 
                                    borderRadius: '4px',
                                    border: isSelected ? 'none' : '2px solid rgba(148, 163, 184, 0.4)',
                                    background: isSelected ? '#58a6ff' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '12px',
                                    flexShrink: 0,
                                  }}>
                                    {isSelected && '✓'}
                                  </span>
                                  {label.name}
                                </button>
                              );
                            })}
                          </div>

                          {/* Create new label */}
                          <div style={{ 
                            borderTop: '1px solid rgba(148, 163, 184, 0.2)', 
                            paddingTop: '10px',
                            display: 'flex',
                            gap: '6px',
                          }}>
                            <input
                              type="text"
                              value={newLabelName}
                              onChange={(e) => setNewLabelName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  createLabel(newLabelName);
                                }
                              }}
                              placeholder="New label..."
                              className={css({
                                flex: 1,
                                padding: '8px 10px',
                                borderRadius: '6px',
                                background: 'rgba(148, 163, 184, 0.1)',
                                border: '1px solid rgba(148, 163, 184, 0.2)',
                                color: '#f5f5f5',
                                fontSize: '12px',
                                outline: 'none',
                                _focus: {
                                  borderColor: 'rgba(88, 166, 255, 0.5)',
                                },
                                _placeholder: {
                                  color: '#64748b',
                                },
                              })}
                            />
                            <button
                              onClick={() => createLabel(newLabelName)}
                              disabled={!newLabelName.trim()}
                              className={css({
                                padding: '8px 12px',
                                borderRadius: '6px',
                                background: newLabelName.trim() 
                                  ? 'rgba(88, 166, 255, 0.3)' 
                                  : 'rgba(148, 163, 184, 0.1)',
                                border: '1px solid rgba(88, 166, 255, 0.4)',
                                color: newLabelName.trim() ? '#f5f5f5' : '#64748b',
                                fontSize: '12px',
                                cursor: newLabelName.trim() ? 'pointer' : 'not-allowed',
                                transition: 'all 0.2s',
                                _hover: newLabelName.trim() ? {
                                  background: 'rgba(88, 166, 255, 0.4)',
                                } : {},
                              })}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Archive button */}
                      {!post.archived && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            archivePost(post.shortcode);
                          }}
                          className={css({
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: 'rgba(148, 163, 184, 0.1)',
                            border: '1px solid rgba(148, 163, 184, 0.2)',
                            color: '#94a3b8',
                            fontSize: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
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
            </div>
          );
        })}
      </div>

      {/* Scroll Position Indicator */}
      {filteredPosts.length > 1 && (
        <div
          ref={scrollTrackRef}
          className={css({
            position: 'fixed',
            left: 'max(4px, env(safe-area-inset-left))',
            top: '50%',
            transform: 'translateY(-50%)',
            height: '40vh',
            width: '4px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '2px',
            cursor: 'pointer',
            zIndex: 60,
            transition: isDraggingScrollbar ? 'none' : 'opacity 0.2s',
            opacity: isDraggingScrollbar ? 1 : 0.5,
            _hover: {
              opacity: 1,
              width: '6px',
            },
          })}
          onMouseDown={handleScrollbarMouseDown}
          onTouchStart={handleScrollbarTouchStart}
        >
          {/* Thumb */}
          <div
            className={css({
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '8px',
              height: '24px',
              background: isDraggingScrollbar 
                ? 'rgba(88, 166, 255, 0.9)' 
                : 'rgba(255, 255, 255, 0.8)',
              borderRadius: '4px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              transition: isDraggingScrollbar ? 'none' : 'all 0.15s ease-out',
              pointerEvents: 'none',
            })}
            style={{
              top: `calc(${(currentPostIndex / Math.max(1, filteredPosts.length - 1)) * 100}% - 12px)`,
            }}
          />
          {/* Current position indicator */}
          <div
            className={css({
              position: 'absolute',
              left: '16px',
              transform: 'translateY(-50%)',
              background: 'rgba(0, 0, 0, 0.85)',
              color: '#f5f5f5',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              opacity: isDraggingScrollbar ? 1 : 0,
              transition: 'opacity 0.2s',
              pointerEvents: 'none',
            })}
            style={{
              top: `calc(${(currentPostIndex / Math.max(1, filteredPosts.length - 1)) * 100}%)`,
            }}
          >
            {currentPostIndex + 1} / {filteredPosts.length}
          </div>
        </div>
      )}

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
                handleLabelSelect(null);
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
                  handleLabelSelect(label.id);
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
