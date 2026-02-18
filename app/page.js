'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { FILTERS, applyFilterToCanvas, formatDateStamp, generateStoryImage } from '@/lib/filters'

const DEFAULT_BIO = 'Collecting moments, not things'
const ONE_YEAR_REJECTION = 'This memory is still being made. VINTAGE will remind you when it\'s ready.'

function isOlderThanOneYear(dateValue) {
  if (!dateValue) return false
  const source = new Date(dateValue)
  if (Number.isNaN(source.getTime())) return false
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  return source <= oneYearAgo
}

function createInviteCode() {
  return `VNT-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function formatAgoLabel(dateValue) {
  const date = new Date(dateValue)
  const now = new Date()
  const years = Math.max(1, now.getFullYear() - date.getFullYear())
  return `${years} year${years > 1 ? 's' : ''} ago`
}

function dateKey(value) {
  const d = new Date(value)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function sentenceCount(text) {
  const parts = text.match(/[^.!?]+[.!?]*/g) || []
  return parts.map((part) => part.trim()).filter(Boolean).length
}

function formatMonthDay(dateValue) {
  const date = new Date(dateValue)
  return {
    month: date.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: String(date.getDate()).padStart(2, '0')
  }
}

async function reverseGeocode(latitude, longitude) {
  if (!latitude || !longitude) return null

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`)
    if (!response.ok) return null
    const payload = await response.json()
    const city = payload?.address?.city || payload?.address?.town || payload?.address?.village
    const country = payload?.address?.country
    if (city && country) return `${city}, ${country}`
    return country || payload?.display_name || null
  } catch {
    return null
  }
}

const UploadFilteredPreview = memo(function UploadFilteredPreview({ src, filter, dateStamp, className = '', onClick }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const [processed, setProcessed] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '250px' })

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !src || !isVisible) return

    const context = canvas.getContext('2d')
    const image = new Image()
    image.crossOrigin = 'anonymous'
    setProcessed(false)

    image.onload = () => {
      canvas.width = image.width
      canvas.height = image.height
      context.drawImage(image, 0, 0)
      applyFilterToCanvas(canvas, context, filter, dateStamp)
      setProcessed(true)
    }

    image.src = src
  }, [src, filter, dateStamp, isVisible])

  return (
    <div ref={containerRef} onClick={onClick} className={`relative ${className}`}>
      <canvas ref={canvasRef} className={`w-full h-auto block transition-opacity duration-300 ${processed ? 'opacity-100' : 'opacity-0'}`} />
      {!processed && <div className="w-full pb-[100%] bg-gray-200 shimmer" />}
    </div>
  )
})


function DisplayPhoto({ src, alt = 'memory', className = '', onClick }) {
  return <img src={src} alt={alt} loading="lazy" className={`w-full h-auto block ${className}`} onClick={onClick} />
}

export default function VintageApp() {
  const [screen, setScreen] = useState('welcome')
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileStats, setProfileStats] = useState({ followers: 0, following: 0 })
  const [profileViewMode, setProfileViewMode] = useState('photoAgeOldest')

  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '', username: '' })
  const [authError, setAuthError] = useState('')

  const [notification, setNotification] = useState('')
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [selectedProfilePost, setSelectedProfilePost] = useState(null)

  const [posts, setPosts] = useState([])
  const [likedPosts, setLikedPosts] = useState(new Set())
  const [commentsByPost, setCommentsByPost] = useState({})
  const [commentDraftByPost, setCommentDraftByPost] = useState({})

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [followingSet, setFollowingSet] = useState(new Set())
  const [viewedProfile, setViewedProfile] = useState(null)
  const [viewedProfilePosts, setViewedProfilePosts] = useState([])
  const [viewedProfileViewMode, setViewedProfileViewMode] = useState('photoAgeOldest')

  const [uploadStep, setUploadStep] = useState('select')
  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploadedPreview, setUploadedPreview] = useState(null)
  const [selectedFilter, setSelectedFilter] = useState('slimAarons')
  const [uploadCaption, setUploadCaption] = useState('')
  const [photoDate, setPhotoDate] = useState(null)
  const [manualDate, setManualDate] = useState('')
  const [needsManualDate, setNeedsManualDate] = useState(false)
  const [memoryBank, setMemoryBank] = useState([])
  const [pendingUploadMeta, setPendingUploadMeta] = useState({ latitude: null, longitude: null, locationName: null })

  const [memoryLockData, setMemoryLockData] = useState(null)
  const [scheduledMemoryReminders, setScheduledMemoryReminders] = useState([])
  const [sharedMemoryAlerts, setSharedMemoryAlerts] = useState([])

  const myPosts = useMemo(() => posts.filter((post) => post.user_id === user?.id), [posts, user?.id])

  const sortedProfilePosts = useMemo(() => {
    const copy = [...myPosts]
    if (profileViewMode === 'classic') {
      return copy.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }
    if (profileViewMode === 'photoAgeNewest') {
      return copy.sort((a, b) => new Date(b.photo_date || b.created_at) - new Date(a.photo_date || a.created_at))
    }
    if (profileViewMode === 'photoAgeOldest') {
      return copy.sort((a, b) => new Date(a.photo_date || a.created_at) - new Date(b.photo_date || b.created_at))
    }
    return copy
  }, [myPosts, profileViewMode])

  const threadItems = useMemo(() => {
    const items = []
    let previousYear = null
    sortedProfilePosts.forEach((post) => {
      const year = new Date(post.photo_date || post.created_at).getFullYear()
      if (year !== previousYear) {
        items.push({ type: 'year', id: `year-${year}`, year })
        previousYear = year
      }
      items.push({ type: 'post', id: post.id, post })
    })
    return items
  }, [sortedProfilePosts])

  const mapClusters = useMemo(() => {
    const source = myPosts.filter((post) => post.latitude && post.longitude)
    const clusters = new Map()
    source.forEach((post) => {
      const key = `${post.latitude.toFixed(1)}:${post.longitude.toFixed(1)}`
      if (!clusters.has(key)) clusters.set(key, [])
      clusters.get(key).push(post)
    })
    return [...clusters.values()]
  }, [myPosts])

  const sortedViewedProfilePosts = useMemo(() => {
    const copy = [...viewedProfilePosts]
    if (viewedProfileViewMode === 'classic') {
      return copy.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }
    if (viewedProfileViewMode === 'photoAgeNewest') {
      return copy.sort((a, b) => new Date(b.photo_date || b.created_at) - new Date(a.photo_date || a.created_at))
    }
    if (viewedProfileViewMode === 'photoAgeOldest') {
      return copy.sort((a, b) => new Date(a.photo_date || a.created_at) - new Date(b.photo_date || b.created_at))
    }
    return copy
  }, [viewedProfilePosts, viewedProfileViewMode])

  const viewedProfileThreadItems = useMemo(() => buildThreadItems(sortedViewedProfilePosts), [sortedViewedProfilePosts])

  const viewedProfileMapClusters = useMemo(() => {
    const source = viewedProfilePosts.filter((post) => post.latitude && post.longitude)
    const clusters = new Map()
    source.forEach((post) => {
      const key = `${post.latitude.toFixed(1)}:${post.longitude.toFixed(1)}`
      if (!clusters.has(key)) clusters.set(key, [])
      clusters.get(key).push(post)
    })
    return [...clusters.values()]
  }, [viewedProfilePosts])

  const onThisDay = useMemo(() => {
    const now = new Date()
    return memoryBank.filter((item) => {
      const date = new Date(item.photoDate)
      return date.getDate() === now.getDate() && date.getMonth() === now.getMonth()
    })
  }, [memoryBank])

  const thisWeekFallback = useMemo(() => {
    if (onThisDay.length > 0) return []
    const now = new Date()
    const week = now.getDay()
    return memoryBank.filter((item) => {
      const d = new Date(item.photoDate)
      return d.getMonth() === now.getMonth() && Math.abs(d.getDate() - now.getDate()) <= 7 && d.getDay() === week
    })
  }, [memoryBank, onThisDay])

  const annualMuseum = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const thisYear = myPosts.filter((post) => new Date(post.created_at).getFullYear() === currentYear)
    const locations = new Set(thisYear.map((post) => post.location_name).filter(Boolean))
    const mostLiked = thisYear.sort((a, b) => (b.likes || 0) - (a.likes || 0))[0]
    return {
      year: currentYear,
      total: thisYear.length,
      locations: locations.size,
      earliest: thisYear.length ? thisYear.sort((a, b) => new Date(a.photo_date || a.created_at) - new Date(b.photo_date || b.created_at))[0] : null,
      mostLiked
    }
  }, [myPosts])

  function showNotification(message) {
    setNotification(message)
  }

  function scheduleMemoryReminder(photoTakenAt, locationName) {
    const taken = new Date(photoTakenAt)
    taken.setFullYear(taken.getFullYear() + 1)
    const reminder = {
      id: `${Date.now()}-${locationName || 'memory'}`,
      eligibleOn: taken.toISOString(),
      locationName: locationName || 'Unknown place'
    }
    setScheduledMemoryReminders((prev) => [reminder, ...prev])
  }

  function resetUploadSelection() {
    if (uploadedPreview) URL.revokeObjectURL(uploadedPreview)
    setUploadStep('select')
    setUploadedFile(null)
    setUploadedPreview(null)
    setUploadCaption('')
    setPhotoDate(null)
    setManualDate('')
    setNeedsManualDate(false)
    setSelectedFilter('slimAarons')
    setPendingUploadMeta({ latitude: null, longitude: null, locationName: null })
  }

  useEffect(() => {
    const timer = notification ? setTimeout(() => setNotification(''), 3000) : null
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [notification])

  useEffect(() => {
    return () => {
      if (uploadedPreview) URL.revokeObjectURL(uploadedPreview)
      memoryBank.forEach((item) => URL.revokeObjectURL(item.objectUrl))
    }
  }, [uploadedPreview, memoryBank])

  useEffect(() => {
    async function initSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUser(session.user)
        setScreen('feed')
      }
    }
    initSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        setScreen('feed')
      } else {
        setUser(null)
        setProfile(null)
        setPosts([])
        setCommentsByPost({})
        setScreen('welcome')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    refreshAll()
  }, [user])

  useEffect(() => {
    if (!user || posts.length < 2) return
    const followingIds = new Set([...followingSet, user.id])
    const ownPosts = posts.filter((post) => post.user_id === user.id && post.latitude && post.longitude)
    const friendPosts = posts.filter((post) => post.user_id !== user.id && followingIds.has(post.user_id) && post.latitude && post.longitude)
    const alerts = []

    ownPosts.forEach((mine) => {
      friendPosts.forEach((theirs) => {
        if (dateKey(mine.photo_date || mine.created_at) !== dateKey(theirs.photo_date || theirs.created_at)) return
        const latDiff = Math.abs(mine.latitude - theirs.latitude)
        const lonDiff = Math.abs(mine.longitude - theirs.longitude)
        if (latDiff <= 0.015 && lonDiff <= 0.015) {
          alerts.push({
            id: `${mine.id}-${theirs.id}`,
            friend: theirs.profile?.username || 'A friend',
            day: new Date(mine.photo_date || mine.created_at).toLocaleDateString(),
            mine,
            theirs
          })
        }
      })
    })

    setSharedMemoryAlerts(alerts.slice(0, 12))
  }, [posts, user, followingSet])

  async function refreshAll() {
    await Promise.all([loadProfile(), loadFollowing(), loadLikes(), loadProfileStats(), loadPosts()])
  }

  async function loadProfile() {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (!error) setProfile(data)
  }

  async function loadProfileStats() {
    const [{ count: following }, { count: followers }] = await Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id)
    ])
    setProfileStats({ following: following || 0, followers: followers || 0 })
  }

  async function loadFollowing() {
    const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
    if (!error) setFollowingSet(new Set((data || []).map((item) => item.following_id)))
  }

  async function loadLikes() {
    const { data, error } = await supabase.from('likes').select('post_id').eq('user_id', user.id)
    if (!error) setLikedPosts(new Set((data || []).map((item) => item.post_id)))
  }

  async function loadPosts() {
    setLoadingFeed(true)
    const { data: follows, error: followsError } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
    if (followsError) {
      showNotification('Could not load follows')
      setLoadingFeed(false)
      return
    }

    const visibleUserIds = [user.id, ...(follows || []).map((item) => item.following_id)]
    const { data: postsData, error: postsError } = await supabase.from('posts').select('*').in('user_id', visibleUserIds).order('created_at', { ascending: false })
    if (postsError) {
      showNotification('Could not load feed')
      setLoadingFeed(false)
      return
    }

    const userIds = [...new Set((postsData || []).map((post) => post.user_id))]
    const { data: profileRows } = userIds.length
      ? await supabase.from('profiles').select('id, username, avatar_url, bio').in('id', userIds)
      : { data: [] }

    const mergedPosts = (postsData || []).map((post) => ({
      ...post,
      profile: (profileRows || []).find((row) => row.id === post.user_id)
    }))

    setPosts(mergedPosts)

    if (!postsData?.length) {
      setCommentsByPost({})
      setLoadingFeed(false)
      return
    }

    const { data: comments, error: commentsError } = await supabase.from('comments').select('id, post_id, text, created_at, user_id').in('post_id', postsData.map((post) => post.id)).order('created_at', { ascending: true })
    if (commentsError) {
      setCommentsByPost({})
      setLoadingFeed(false)
      return
    }

    const commenterIds = [...new Set((comments || []).map((comment) => comment.user_id))]
    const { data: commenterProfiles } = commenterIds.length ? await supabase.from('profiles').select('id, username').in('id', commenterIds) : { data: [] }
    const usernameById = new Map((commenterProfiles || []).map((item) => [item.id, item.username]))

    const grouped = (comments || []).reduce((acc, current) => {
      if (!acc[current.post_id]) acc[current.post_id] = []
      acc[current.post_id].push({ ...current, username: usernameById.get(current.user_id) || 'user' })
      return acc
    }, {})

    setCommentsByPost(grouped)
    setLoadingFeed(false)
  }

  async function ensureAuthedSession(email, password) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) return true
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return !error
  }

  async function createStarterInvites(creatorId) {
    const payload = Array.from({ length: 5 }).map(() => ({ code: createInviteCode(), creator_id: creatorId }))
    await supabase.from('invite_codes').insert(payload)
  }

  async function handleAuth() {
    setAuthError('')
    if (!authForm.email || !authForm.password) {
      setAuthError('Email and password are required')
      return
    }

    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email: authForm.email, password: authForm.password })
      if (error || !data?.user?.id) {
        setAuthError(error?.message || 'Signup failed')
        return
      }

      await supabase.from('profiles').upsert({ id: data.user.id, username: authForm.username?.trim() || authForm.email.split('@')[0], bio: DEFAULT_BIO })
      const authed = await ensureAuthedSession(authForm.email, authForm.password)
      if (authed) await createStarterInvites(data.user.id)

      showNotification('Welcome to VINTAGE')
      setAuthMode('login')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password })
    if (error) {
      setAuthError(error.message)
      return
    }
    showNotification('Welcome back')
  }

  async function handlePickMemory(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (uploadedPreview) URL.revokeObjectURL(uploadedPreview)
    const nextPreview = URL.createObjectURL(file)
    setUploadedFile(file)
    setUploadedPreview(nextPreview)
    setUploadStep('filter')

    try {
      const exifr = (await import('exifr')).default
      const exif = await exifr.parse(file)
      const parsedDate = exif?.DateTimeOriginal ? new Date(exif.DateTimeOriginal) : null
      const locationName = await reverseGeocode(exif?.latitude, exif?.longitude)

      setPendingUploadMeta({ latitude: exif?.latitude || null, longitude: exif?.longitude || null, locationName })

      if (!parsedDate) {
        setNeedsManualDate(true)
        setPhotoDate(null)
        showNotification('No EXIF date found. Please enter memory date manually.')
        return
      }

      if (!isOlderThanOneYear(parsedDate)) {
        const eligibleDate = new Date(parsedDate)
        eligibleDate.setFullYear(eligibleDate.getFullYear() + 1)
        setMemoryLockData({ photoDate: parsedDate, eligibleDate, locationName })
        scheduleMemoryReminder(parsedDate, locationName)
        setScreen('memoryLock')
        resetUploadSelection()
        return
      }

      setNeedsManualDate(false)
      setPhotoDate(parsedDate)
    } catch {
      setNeedsManualDate(true)
      setPhotoDate(null)
      showNotification('No EXIF date found. Please enter memory date manually.')
    }
  }

  async function importMemoryBank(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const exifr = (await import('exifr')).default
    const loaded = await Promise.all(files.map(async (file) => {
      let exif = null
      try { exif = await exifr.parse(file) } catch { exif = null }
      const photoDate = exif?.DateTimeOriginal || new Date(file.lastModified)
      const locationName = await reverseGeocode(exif?.latitude, exif?.longitude)
      return {
        id: `${file.name}-${file.lastModified}`,
        file,
        objectUrl: URL.createObjectURL(file),
        filename: file.name,
        photoDate,
        locationName,
        latitude: exif?.latitude || null,
        longitude: exif?.longitude || null,
        eligible: isOlderThanOneYear(photoDate)
      }
    }))

    setMemoryBank((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]))
      loaded.forEach((item) => byId.set(item.id, item))
      return [...byId.values()].sort((a, b) => new Date(b.photoDate) - new Date(a.photoDate))
    })
    showNotification('Memories indexed locally')
  }

  function useMemoryForPost(memory) {
    if (!isOlderThanOneYear(memory.photoDate)) {
      const eligibleDate = new Date(memory.photoDate)
      eligibleDate.setFullYear(eligibleDate.getFullYear() + 1)
      setMemoryLockData({ photoDate: memory.photoDate, eligibleDate, locationName: memory.locationName })
      scheduleMemoryReminder(memory.photoDate, memory.locationName)
      setScreen('memoryLock')
      return
    }

    if (uploadedPreview) URL.revokeObjectURL(uploadedPreview)
    setUploadedFile(memory.file)
    setUploadedPreview(memory.objectUrl)
    setUploadStep('filter')
    setNeedsManualDate(false)
    setPhotoDate(new Date(memory.photoDate))
    setPendingUploadMeta({ latitude: memory.latitude, longitude: memory.longitude, locationName: memory.locationName })
  }


  async function processImageToJpegBlob(src, filter, dateStamp) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0)
        applyFilterToCanvas(canvas, context, filter, dateStamp)
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Failed to process image'))
            return
          }
          resolve(blob)
        }, 'image/jpeg', 0.9)
      }
      image.onerror = () => reject(new Error('Image load failed'))
      image.src = src
    })
  }

  async function handleCreatePost() {
    if (!uploadedFile) {
      showNotification('Select a memory first')
      return
    }

    const effectiveDate = needsManualDate ? new Date(manualDate) : photoDate
    if (!effectiveDate || Number.isNaN(effectiveDate.getTime())) {
      showNotification('Add a valid memory date')
      return
    }

    if (!isOlderThanOneYear(effectiveDate)) {
      const eligibleDate = new Date(effectiveDate)
      eligibleDate.setFullYear(eligibleDate.getFullYear() + 1)
      setMemoryLockData({ photoDate: effectiveDate, eligibleDate, locationName: pendingUploadMeta.locationName })
      scheduleMemoryReminder(effectiveDate, pendingUploadMeta.locationName)
      setScreen('memoryLock')
      return
    }

    const dateStamp = formatDateStamp(effectiveDate)
    const previewSource = uploadedPreview || URL.createObjectURL(uploadedFile)

    let processedBlob
    try {
      processedBlob = await processImageToJpegBlob(previewSource, selectedFilter, dateStamp)
    } catch {
      showNotification('Image processing failed')
      return
    }

    const fileName = `${user.id}/${Date.now()}-processed.jpg`
    const { error: uploadError } = await supabase.storage.from('photos').upload(fileName, processedBlob, {
      contentType: 'image/jpeg',
      upsert: false
    })

    if (uploadError) {
      showNotification('Upload failed')
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName)

    const { error: postError } = await supabase.from('posts').insert({
      user_id: user.id,
      image_url: publicUrl,
      caption: uploadCaption.trim(),
      filter: selectedFilter,
      photo_date: effectiveDate.toISOString(),
      date_stamp: dateStamp,
      latitude: pendingUploadMeta.latitude,
      longitude: pendingUploadMeta.longitude,
      location_name: pendingUploadMeta.locationName
    })

    if (postError) {
      showNotification('Post failed')
      return
    }

    resetUploadSelection()
    setScreen('feed')
    showNotification('Memory posted')
    await refreshAll()
  }

  async function handleSharePost(post) {
    const shareUrl = post.image_url
    const shareText = `${post.caption || 'A memory from VINTAGE'}${post.location_name ? ` — ${post.location_name}` : ''}`

    if (navigator.share) {
      try {
        await navigator.share({ title: 'VINTAGE Memory', text: shareText, url: shareUrl })
        return
      } catch {
        // user cancelled or share unavailable
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      showNotification('Memory link copied. Paste into any app to share.')
    } catch {
      showNotification('Share unavailable on this device.')
    }
  }

  async function handleLike(post) {
    const liked = likedPosts.has(post.id)
    const nextLikes = liked ? Math.max((post.likes || 1) - 1, 0) : (post.likes || 0) + 1

    setPosts((prev) => prev.map((item) => item.id === post.id ? { ...item, likes: nextLikes } : item))
    setLikedPosts((prev) => {
      const next = new Set(prev)
      if (liked) next.delete(post.id)
      else next.add(post.id)
      return next
    })

    if (liked) {
      await supabase.from('likes').delete().eq('user_id', user.id).eq('post_id', post.id)
    } else {
      await supabase.from('likes').insert({ user_id: user.id, post_id: post.id })
    }

    await supabase.from('posts').update({ likes: nextLikes }).eq('id', post.id)
  }

  async function handleDeletePost(postId) {
    const post = posts.find((item) => item.id === postId)
    if (!post || post.user_id !== user?.id) return
    if (!window.confirm('Delete this memory? This cannot be undone.')) return
    const { error } = await supabase.from('posts').delete().eq('id', postId)
    if (error) {
      showNotification('Could not delete post')
      return
    }
    showNotification('Memory deleted')
    await loadPosts()
  }

  async function handleComment(postId) {
    const draft = commentDraftByPost[postId] || ''
    if (!draft.trim()) return
    if (sentenceCount(draft) > 2) {
      showNotification('Comments are limited to two sentences.')
      return
    }

    const { error } = await supabase.from('comments').insert({ user_id: user.id, post_id: postId, text: draft.trim() })
    if (error) {
      showNotification('Could not add comment')
      return
    }

    setCommentDraftByPost((prev) => ({ ...prev, [postId]: '' }))
    await loadPosts()
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    const { data, error } = await supabase.from('profiles').select('id, username, bio, avatar_url').ilike('username', `%${searchQuery.trim()}%`).limit(20)
    if (error) {
      showNotification('Search failed')
      return
    }
    setSearchResults(data || [])
  }

  async function openProfileFromSearch(userId) {
    const { data: foundProfile } = await supabase.from('profiles').select('*').eq('id', userId).single()
    const { data: foundPosts } = await supabase.from('posts').select('*').eq('user_id', userId).order('photo_date', { ascending: true })

    setViewedProfile(foundProfile)
    setViewedProfilePosts(foundPosts || [])
    setViewedProfileViewMode('photoAgeOldest')
    setScreen('viewedProfile')
  }

  async function toggleFollow(targetUserId) {
    if (followingSet.has(targetUserId)) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetUserId)
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: targetUserId })
    }

    await Promise.all([loadFollowing(), loadProfileStats(), loadPosts()])
  }

  async function saveProfile() {
    if (!profile?.username?.trim()) {
      showNotification('Username required')
      return
    }

    const { error } = await supabase.from('profiles').update({ username: profile.username.trim(), bio: profile.bio || DEFAULT_BIO }).eq('id', user.id)
    if (error) {
      showNotification('Could not save profile')
      return
    }

    showNotification('Profile updated')
    await loadProfile()
  }

  function exportStory(post) {
    const dateStamp = post.date_stamp || formatDateStamp(post.photo_date || new Date())
    showNotification('Preparing story export...')
    generateStoryImage(post.image_url, post.filter, dateStamp, (blob) => {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `vintage-story-${dateStamp}.png`
      anchor.click()
      URL.revokeObjectURL(url)
      showNotification('Story image saved')
    })
  }

  const notificationFeed = [
    ...scheduledMemoryReminders.map((item) => ({ id: item.id, text: `Your memory from ${item.locationName} is ready on ${new Date(item.eligibleOn).toLocaleDateString()}.` })),
    ...sharedMemoryAlerts.map((item) => ({ id: item.id, text: `You and ${item.friend} were both there on ${item.day}.` }))
  ]

  return (
    <div className="min-h-screen pb-28">
      {notification && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-vintage-charcoal text-white px-4 py-2 rounded text-sm">{notification}</div>}

      {selectedProfilePost && (
        <div className="fixed inset-0 z-[120] bg-black/85 flex items-center justify-center p-4" onClick={() => setSelectedProfilePost(null)}>
          <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
            <div className="flex justify-end mb-2"><button className="text-white text-sm underline" onClick={() => setSelectedProfilePost(null)}>Close</button></div>
            <div className="bg-white rounded-xl p-3">
              <DisplayPhoto src={selectedProfilePost.image_url} className="rounded overflow-hidden" />
              <p className="text-sm mt-3"><span className="font-semibold mr-2">{selectedProfilePost.profile?.username || profile?.username}</span>{selectedProfilePost.caption}</p>
            </div>
          </div>
        </div>
      )}

      {screen === 'memoryLock' && (
        <section className="min-h-screen flex items-center justify-center p-8 text-center">
          <div className="max-w-md bg-white border border-[#ece9df] rounded-2xl p-8">
            <p className="text-xl mb-3">This memory is still being made.</p>
            <p className="text-vintage-muted mb-4">VINTAGE will remind you when it’s ready.</p>
            {memoryLockData && <p className="text-sm mb-5">Eligible on {new Date(memoryLockData.eligibleDate).toLocaleDateString()} {memoryLockData.locationName ? `— ${memoryLockData.locationName}` : ''}</p>}
            <button className="w-full p-3 bg-vintage-charcoal text-white" onClick={() => setScreen('memories')}>Back to Memories</button>
          </div>
        </section>
      )}

      {screen === 'welcome' && (
        <section className="min-h-screen flex flex-col justify-center max-w-md mx-auto px-8 text-center fade-in">
          <h1 className="text-5xl tracking-[7px] mb-4">VINTAGE</h1>
          <p className="italic text-vintage-muted mb-2">The future is retro.</p>
          <p className="italic text-vintage-muted mb-8">A museum for your memories</p>
          <div className="space-y-3">
            {authMode === 'signup' && <input className="w-full p-3 border rounded bg-white" placeholder="Username" value={authForm.username} onChange={(event) => setAuthForm({ ...authForm, username: event.target.value })} />}
            <input className="w-full p-3 border rounded bg-white" type="email" placeholder="Email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} />
            <input className="w-full p-3 border rounded bg-white" type="password" placeholder="Password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} />
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <button onClick={handleAuth} className="w-full p-3 bg-vintage-charcoal text-white tracking-[2px]">{authMode === 'login' ? 'ENTER MUSEUM' : 'CREATE ACCOUNT'}</button>
            <button className="underline text-sm" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>{authMode === 'login' ? 'Need an account?' : 'Already have an account?'}</button>
          </div>
        </section>
      )}

      {user && !['welcome', 'memoryLock'].includes(screen) && (
        <>
          <header className="sticky top-0 bg-vintage-cream border-b p-4 z-30">
            <div className="max-w-xl mx-auto flex justify-between items-center">
              <h2 className="tracking-[4px] text-xl">VINTAGE</h2>
              <button className="text-sm underline" onClick={refreshAll}>Refresh</button>
            </div>
          </header>

          <main className="max-w-xl mx-auto p-4 fade-in">
            {screen === 'feed' && (
              <div className="space-y-5">
                {loadingFeed && <p className="text-vintage-muted text-center py-8">Loading feed...</p>}
                {!loadingFeed && posts.length === 0 && <p className="text-vintage-muted text-center py-16">Follow friends to fill your museum feed.</p>}
                {posts.map((post) => (
                  <article key={post.id} className="bg-white p-3 rounded-lg shadow-sm border border-[#ece9df]">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold">{post.profile?.username || 'anonymous'}</p>
                        <p className="text-xs text-vintage-muted">{new Date(post.created_at).toLocaleDateString()} {post.location_name ? `— ${post.location_name}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button className="text-xs underline" onClick={() => exportStory(post)}>Story export</button>
                        <PostOverflowMenu post={post} canDelete={post.user_id === user?.id} onDelete={handleDeletePost} onShare={handleSharePost} />
                      </div>
                    </div>
                    <div onDoubleClick={() => handleLike(post)}>
                      <DisplayPhoto src={post.image_url} className="rounded overflow-hidden" />
                    </div>
                    <div className="flex items-center justify-between mt-2"><button onClick={() => handleLike(post)}>{likedPosts.has(post.id) ? '♥' : '♡'} {post.likes || 0}</button><span className="text-xs text-vintage-muted">{(commentsByPost[post.id] || []).length} comments</span></div>
                    <p className="mt-2"><span className="font-semibold mr-2">{post.profile?.username}</span>{post.caption}</p>
                    <div className="mt-3 pt-2 border-t">
                      <div className="space-y-1 mb-2">{(commentsByPost[post.id] || []).slice(-3).map((comment) => <p key={comment.id} className="text-sm"><span className="font-semibold mr-1">{comment.username}</span>{comment.text}</p>)}</div>
                      <div className="flex gap-2">
                        <input className="flex-1 border rounded px-2 py-1 text-sm" placeholder="Write up to two sentences" value={commentDraftByPost[post.id] || ''} onChange={(event) => setCommentDraftByPost((prev) => ({ ...prev, [post.id]: event.target.value }))} />
                        <button className="text-sm underline" onClick={() => handleComment(post.id)}>Post</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {screen === 'memories' && (
              <section className="space-y-4">
                <h3 className="text-xl">Memories Engine</h3>
                {onThisDay[0] && (
                  <div className="bg-white p-3 rounded-xl border border-[#ece9df]">
                    <p className="text-sm mb-2">On This Day — {formatAgoLabel(onThisDay[0].photoDate)} {onThisDay[0].locationName ? `— ${onThisDay[0].locationName}` : ''}</p>
                    <img src={onThisDay[0].objectUrl} alt="On this day" className="w-full rounded-lg mb-2" />
                    <button className="text-sm underline" onClick={() => useMemoryForPost(onThisDay[0])}>Add to your museum</button>
                  </div>
                )}
                {!onThisDay[0] && thisWeekFallback[0] && <p className="text-sm text-vintage-muted">No exact date match. Showing this week in {new Date(thisWeekFallback[0].photoDate).getFullYear()}.</p>}

                <div className="bg-white p-4 rounded-lg border">
                  <label className="inline-block text-sm underline cursor-pointer mb-4">Index local photos<input type="file" multiple accept="image/*" onChange={importMemoryBank} className="hidden" /></label>
                  <p className="text-sm text-vintage-muted mb-2">Calendar Browse</p>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {Array.from(new Set(memoryBank.map((m) => `${new Date(m.photoDate).getFullYear()}-${new Date(m.photoDate).getMonth() + 1}`))).slice(0, 9).map((bucket) => (
                      <div key={bucket} className="border rounded p-2 text-xs bg-[#faf9f4]">{bucket}</div>
                    ))}
                  </div>

                  <p className="text-sm text-vintage-muted mb-2">Time-Period Views</p>
                  <div className="space-y-2 mb-4 text-sm">
                    <div>This Week in {new Date().getFullYear() - 1}</div>
                    <div>This Month in {new Date().getFullYear() - 3}</div>
                    <div>Your Summer {new Date().getFullYear() - 2}</div>
                  </div>

                  <p className="text-sm text-vintage-muted mb-2">Timeline</p>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {memoryBank.map((item) => (
                      <div key={item.id} className="flex gap-3 items-center">
                        <button onClick={() => useMemoryForPost(item)}><img src={item.objectUrl} alt={item.filename} className="w-12 h-12 rounded object-cover" /></button>
                        <div className="flex-1">
                          <p className="text-sm">{formatAgoLabel(item.photoDate)} {item.locationName ? `— ${item.locationName}` : ''}</p>
                          <p className="text-xs text-vintage-muted">{new Date(item.photoDate).toLocaleDateString()} · {item.filename} {!item.eligible && '· Not eligible yet'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {uploadStep === 'select' && <label className="block border-2 border-dashed rounded-lg p-10 text-center bg-white cursor-pointer"><input type="file" accept="image/*" onChange={handlePickMemory} className="hidden" />Select memory to post</label>}
                {uploadStep === 'filter' && uploadedPreview && (
                  <>
                    <UploadFilteredPreview src={uploadedPreview} filter={selectedFilter} dateStamp={formatDateStamp(photoDate || manualDate || new Date())} className="rounded overflow-hidden" />
                    <div className="flex gap-2 overflow-x-auto no-scrollbar">{Object.entries(FILTERS).map(([key, filter]) => <button key={key} className={`px-3 py-2 rounded text-sm ${selectedFilter === key ? 'bg-vintage-charcoal text-white' : 'bg-white border'}`} onClick={() => setSelectedFilter(key)}>{filter.name}</button>)}</div>
                    {needsManualDate && <input type="date" className="w-full p-3 border rounded bg-white" value={manualDate} onChange={(event) => setManualDate(event.target.value)} />}
                    <input value={uploadCaption} onChange={(event) => setUploadCaption(event.target.value)} className="w-full p-3 border rounded bg-white" placeholder="Location, year..." />
                    <div className="grid grid-cols-2 gap-2"><button className="w-full p-3 bg-vintage-charcoal text-white" onClick={handleCreatePost}>Post memory</button><button className="w-full p-3 border" onClick={resetUploadSelection}>Cancel</button></div>
                  </>
                )}
              </section>
            )}

            {screen === 'search' && (
              <section>
                <div className="flex gap-2 mb-3"><input className="flex-1 p-3 border rounded bg-white" placeholder="Search usernames" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /><button className="px-4 bg-vintage-charcoal text-white rounded" onClick={handleSearch}>Go</button></div>
                <div className="space-y-3">{searchResults.map((result) => <div key={result.id} className="bg-white p-3 rounded flex justify-between items-center"><button className="text-left flex-1" onClick={() => openProfileFromSearch(result.id)}><p className="font-semibold">{result.username}</p><p className="text-sm text-vintage-muted">{result.bio || DEFAULT_BIO}</p></button>{result.id !== user.id && <button className="text-sm underline" onClick={() => toggleFollow(result.id)}>{followingSet.has(result.id) ? 'Unfollow' : 'Follow'}</button>}</div>)}</div>
              </section>
            )}

            {screen === 'notifications' && (
              <section className="space-y-3">
                <h3 className="text-xl">Notifications</h3>
                <div className="bg-white p-4 rounded-lg border space-y-2">
                  {notificationFeed.length === 0 && <p className="text-sm text-vintage-muted">No notifications yet.</p>}
                  {notificationFeed.map((item) => <p key={item.id} className="text-sm">• {item.text}</p>)}
                </div>
                {sharedMemoryAlerts.length > 0 && (
                  <div className="bg-white p-4 rounded-lg border">
                    <h4 className="font-semibold mb-2">Shared Memories</h4>
                    {sharedMemoryAlerts.slice(0, 3).map((item) => (
                      <div key={item.id} className="grid grid-cols-2 gap-2 mb-3">
                        <DisplayPhoto src={item.mine.image_url} className="rounded overflow-hidden" />
                        <DisplayPhoto src={item.theirs.image_url} className="rounded overflow-hidden" />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {screen === 'viewedProfile' && viewedProfile && (
              <section className="space-y-4">
                <button className="text-sm underline" onClick={() => setScreen('search')}>← Back to search</button>
                <div className="text-center">
                  <p className="text-[20px] tracking-[3px] font-semibold">{viewedProfile.username}</p>
                  <p className="text-[13px] text-[#888] italic mt-1">{viewedProfile.bio || DEFAULT_BIO}</p>
                  <p className="text-[12px] text-[#999] mt-1">{viewedProfilePosts.length} memories</p>
                </div>

                <div className="flex flex-wrap gap-2 justify-center">
                  <button className={`px-4 h-[30px] rounded-full text-[11px] ${viewedProfileViewMode === 'classic' ? 'bg-vintage-charcoal text-white' : 'border border-[#D4D4D4] text-[#888]'}`} onClick={() => setViewedProfileViewMode('classic')}>Classic</button>
                  <button className={`px-4 h-[30px] rounded-full text-[11px] ${viewedProfileViewMode === 'photoAgeNewest' ? 'bg-vintage-charcoal text-white' : 'border border-[#D4D4D4] text-[#888]'}`} onClick={() => setViewedProfileViewMode('photoAgeNewest')}>Newest</button>
                  <button className={`px-4 h-[30px] rounded-full text-[11px] ${viewedProfileViewMode === 'photoAgeOldest' ? 'bg-vintage-charcoal text-white' : 'border border-[#D4D4D4] text-[#888]'}`} onClick={() => setViewedProfileViewMode('photoAgeOldest')}>Oldest</button>
                  <button className={`px-4 h-[30px] rounded-full text-[11px] ${viewedProfileViewMode === 'mapView' ? 'bg-vintage-charcoal text-white' : 'border border-[#D4D4D4] text-[#888]'}`} onClick={() => setViewedProfileViewMode('mapView')}>Map</button>
                </div>

                {viewedProfileViewMode === 'classic' && (
                  <div className="grid grid-cols-3 gap-[2px]">
                    {sortedViewedProfilePosts.map((post) => (
                      <button key={post.id} className="text-left w-full" onClick={() => setSelectedProfilePost({ ...post, profile: viewedProfile })}>
                        <DisplayPhoto src={post.image_url} className="aspect-square object-cover overflow-hidden" />
                      </button>
                    ))}
                  </div>
                )}

                {(viewedProfileViewMode === 'photoAgeNewest' || viewedProfileViewMode === 'photoAgeOldest') && (
                  <ThreadTimeline
                    items={viewedProfileThreadItems}
                    commentsByPost={commentsByPost}
                    onOpenPost={(post) => setSelectedProfilePost({ ...post, profile: viewedProfile })}
                    currentUserId={user?.id}
                    onDeletePost={handleDeletePost}
                    onSharePost={handleSharePost}
                    canDelete={false}
                  />
                )}

                {viewedProfileViewMode === 'mapView' && (
                  <div className="bg-white border rounded-xl p-4">
                    <p className="text-sm text-vintage-muted mb-2">Map clusters (tap a cluster to view a memory)</p>
                    <div className="relative w-full aspect-square rounded-full border border-[#ece9df] bg-[#faf9f4] overflow-hidden">
                      {viewedProfileMapClusters.map((cluster, idx) => {
                        const sample = cluster[0]
                        const top = 50 - ((sample.latitude || 0) / 90) * 40
                        const left = 50 + ((sample.longitude || 0) / 180) * 45
                        return <button key={cluster[0].id + idx} style={{ top: `${top}%`, left: `${left}%` }} className="absolute -translate-x-1/2 -translate-y-1/2 bg-[#D4AF37] text-white rounded-full w-9 h-9 text-xs" onClick={() => setSelectedProfilePost({ ...sample, profile: viewedProfile })}>{cluster.length}</button>
                      })}
                    </div>
                  </div>
                )}
              </section>
            )}

            {screen === 'profile' && profile && (
              <section className="space-y-4">
                <div className="text-center">
                  <div className="w-[70px] h-[70px] rounded-full bg-[#e9e4d8] mx-auto mb-3" />
                  <p className="text-[20px] tracking-[3px] font-semibold">{profile.username}</p>
                  <p className="text-[13px] text-[#888] italic mt-1">{profile.bio || DEFAULT_BIO}</p>
                  <p className="text-[12px] text-[#999] mt-1">{myPosts.length} memories · {profileStats.followers} followers · {profileStats.following} following</p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-[#ece9df] space-y-3">
                  <input className="w-full p-3 border rounded-full text-sm" value={profile.username || ''} onChange={(event) => setProfile({ ...profile, username: event.target.value })} />
                  <div className="rounded-xl border border-[#e9dfc2] bg-gradient-to-br from-[#fffdf6] to-[#f8f4e7] p-4">
                    <p className="text-xs uppercase tracking-[2px] text-[#9c8450] mb-2">Curator Note</p>
                    <textarea className="w-full p-0 border-0 bg-transparent focus:outline-none text-sm leading-relaxed italic" rows={3} value={profile.bio || ''} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} placeholder="Collecting moments, not things" />
                  </div>
                  <button className="text-sm underline" onClick={saveProfile}>Save profile</button>
                </div>

                <div className="flex flex-wrap gap-2 justify-center">
                  <button className={`px-4 h-[30px] rounded-full text-[11px] ${profileViewMode === 'classic' ? 'bg-vintage-charcoal text-white' : 'border border-[#D4D4D4] text-[#888]'}`} onClick={() => setProfileViewMode('classic')}>Classic</button>
                  <button className={`px-4 h-[30px] rounded-full text-[11px] ${profileViewMode === 'photoAgeNewest' ? 'bg-vintage-charcoal text-white' : 'border border-[#D4D4D4] text-[#888]'}`} onClick={() => setProfileViewMode('photoAgeNewest')}>Newest</button>
                  <button className={`px-4 h-[30px] rounded-full text-[11px] ${profileViewMode === 'photoAgeOldest' ? 'bg-vintage-charcoal text-white' : 'border border-[#D4D4D4] text-[#888]'}`} onClick={() => setProfileViewMode('photoAgeOldest')}>Oldest</button>
                  <button className={`px-4 h-[30px] rounded-full text-[11px] ${profileViewMode === 'mapView' ? 'bg-vintage-charcoal text-white' : 'border border-[#D4D4D4] text-[#888]'}`} onClick={() => setProfileViewMode('mapView')}>Map</button>
                </div>

                {profileViewMode === 'classic' && (
                  <div className="grid grid-cols-3 gap-[2px]">
                    {sortedProfilePosts.map((post) => (
                      <div key={post.id} className="relative">
                        <button className="text-left w-full" onClick={() => setSelectedProfilePost(post)}>
                          <DisplayPhoto src={post.image_url} className="aspect-square object-cover overflow-hidden" />
                        </button>
                        <div className="absolute top-1 right-1"><PostOverflowMenu post={post} canDelete={post.user_id === user?.id} onDelete={handleDeletePost} onShare={handleSharePost} compact /></div>
                      </div>
                    ))}
                  </div>
                )}

                {(profileViewMode === 'photoAgeNewest' || profileViewMode === 'photoAgeOldest') && (
                  <ThreadTimeline
                    items={threadItems}
                    commentsByPost={commentsByPost}
                    onOpenPost={setSelectedProfilePost}
                    currentUserId={user?.id}
                    onDeletePost={handleDeletePost}
                    onSharePost={handleSharePost}
                    canDelete
                  />
                )}

                {profileViewMode === 'mapView' && (
                  <div className="bg-white border rounded-xl p-4">
                    <p className="text-sm text-vintage-muted mb-2">Map clusters (tap a cluster to view a memory)</p>
                    <div className="relative w-full aspect-square rounded-full border border-[#ece9df] bg-[#faf9f4] overflow-hidden">
                      {mapClusters.map((cluster, idx) => {
                        const sample = cluster[0]
                        const top = 50 - ((sample.latitude || 0) / 90) * 40
                        const left = 50 + ((sample.longitude || 0) / 180) * 45
                        return <button key={cluster[0].id + idx} style={{ top: `${top}%`, left: `${left}%` }} className="absolute -translate-x-1/2 -translate-y-1/2 bg-[#D4AF37] text-white rounded-full w-9 h-9 text-xs" onClick={() => setSelectedProfilePost(sample)}>{cluster.length}</button>
                      })}
                    </div>
                  </div>
                )}

                <button className="underline text-sm" onClick={() => supabase.auth.signOut()}>Log out</button>
              </section>
            )}
          </main>

          <nav className="fixed bottom-4 left-0 right-0 z-40">
            <div className="max-w-xl mx-auto px-4">
              <div className="grid grid-cols-5 text-center text-xs bg-white border border-[#e8e4d8] rounded-2xl shadow-lg overflow-hidden">
                <button className={`py-3 transition-colors ${screen === 'feed' ? 'bg-vintage-charcoal text-white' : 'text-vintage-charcoal'}`} onClick={() => setScreen('feed')}>Home</button>
                <button className={`py-3 transition-colors ${screen === 'search' ? 'bg-vintage-charcoal text-white' : 'text-vintage-charcoal'}`} onClick={() => setScreen('search')}>Search</button>
                <button className={`py-3 transition-colors font-semibold ${screen === 'memories' ? 'bg-[#D4AF37] text-white' : 'text-[#8d6e1f]'}`} onClick={() => setScreen('memories')}>Memories</button>
                <button className={`py-3 transition-colors ${screen === 'notifications' ? 'bg-vintage-charcoal text-white' : 'text-vintage-charcoal'}`} onClick={() => setScreen('notifications')}>Alerts</button>
                <button className={`py-3 transition-colors ${screen === 'profile' ? 'bg-vintage-charcoal text-white' : 'text-vintage-charcoal'}`} onClick={() => setScreen('profile')}>Profile</button>
              </div>
            </div>
          </nav>
        </>
      )}
    </div>
  )
}

function buildThreadItems(posts) {
  const sorted = [...posts].sort((a, b) => new Date(a.photo_date || a.created_at) - new Date(b.photo_date || b.created_at))
  const items = []
  let year = null
  sorted.forEach((post) => {
    const nextYear = new Date(post.photo_date || post.created_at).getFullYear()
    if (nextYear !== year) {
      items.push({ type: 'year', id: `year-${nextYear}`, year: nextYear })
      year = nextYear
    }
    items.push({ type: 'post', id: post.id, post })
  })
  return items
}

function ThreadTimeline({ items, commentsByPost, onOpenPost, currentUserId, onDeletePost, onSharePost, canDelete }) {
  if (!items.length) {
    return (
      <div className="relative min-h-[220px] pl-[70px]">
        <div className="absolute left-[40px] top-0 bottom-0 w-[2px] bg-[#D4AF37]" />
        <div className="relative pt-10">
          <div className="absolute left-[35px] top-[56px] w-[10px] h-[10px] rounded-full bg-[#D4AF37]" />
          <div className="absolute left-[45px] top-[61px] w-[20px] h-px bg-[#D4AF37]" />
          <p className="italic text-[#999] text-[16px] min-h-[120px] flex items-center">Your museum is empty. Start curating your memories.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative pl-[70px]">
      <div className="absolute left-[40px] top-0 bottom-0 w-[2px] bg-[#D4AF37]" />
      <div className="space-y-1">
        {items.map((item) => item.type === 'year'
          ? <YearMilestone key={item.id} year={item.year} />
          : <TimelineMemoryItem key={item.id} post={item.post} commentsCount={(commentsByPost[item.post.id] || []).length} onOpenPost={onOpenPost} canDelete={canDelete && item.post.user_id === currentUserId} onDeletePost={onDeletePost} onSharePost={onSharePost} />
        )}
      </div>
    </div>
  )
}

function YearMilestone({ year }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true)
    }, { threshold: 0.35 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="relative h-[116px]" ref={ref}>
      <div className={`absolute left-[22px] top-[40px] w-[36px] h-[36px] rounded-full border-2 border-[#D4AF37] bg-[#F5F5F0] flex items-center justify-center text-[12px] tracking-[3px] text-[#D4AF37] transition-all duration-[400ms] ease-out ${visible ? 'opacity-100 scale-100' : 'opacity-50 scale-[0.8]'}`}>
        {year}
      </div>
    </div>
  )
}

function TimelineMemoryItem({ post, commentsCount, onOpenPost, canDelete, onDeletePost, onSharePost }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  const { month, day } = formatMonthDay(post.photo_date || post.created_at)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true)
    }, { threshold: 0.2, rootMargin: '0px 0px -20% 0px' })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <article ref={ref} className={`relative mb-[56px] transition-all duration-[400ms] ease-out ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-[20px]'}`}>
      <div className="absolute left-[-70px] top-[8px] w-[30px] text-right">
        <p className="text-[9px] tracking-[2px] text-[#BBBBBB]">{month}</p>
        <p className="text-[13px] text-[#999999]">{day}</p>
      </div>
      <div className="absolute left-[-35px] top-[24px] w-[10px] h-[10px] rounded-full bg-[#D4AF37]" />
      <div className="absolute left-[-25px] top-[29px] w-[20px] h-px bg-[#D4AF37]" />

      <button className="w-full text-left" onClick={() => onOpenPost(post)}>
        <DisplayPhoto src={post.image_url} className="border border-[rgba(0,0,0,0.05)] min-h-[250px] max-h-[450px] object-cover overflow-hidden" />
      </button>
      <p className="mt-3 text-[13px] tracking-[3px] uppercase">{post.location_name || 'UNKNOWN LOCATION'}</p>
      {post.caption ? <p className="text-[13px] italic text-[#888]">{post.caption}</p> : null}
      <p className="text-[11px] text-[#AAAAAA]">♥ {post.likes || 0} · {commentsCount} comments</p>
      <div className="mt-2"><PostOverflowMenu post={post} canDelete={canDelete} onDelete={onDeletePost} onShare={onSharePost} /></div>
    </article>
  )
}


function PostOverflowMenu({ post, canDelete, onDelete, onShare, compact = false }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block text-left">
      <button
        className={`border border-[#e6e0cf] bg-white text-[#666] ${compact ? 'px-1.5 py-0.5 text-[12px]' : 'px-2 py-1 text-xs'} rounded`}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Post options"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-white border border-[#ece9df] rounded-md shadow-lg z-50">
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-[#f8f5ec]"
            onClick={() => {
              setOpen(false)
              onShare(post)
            }}
          >
            Share post
          </button>
          {canDelete && (
            <button
              className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-[#f8f5ec]"
              onClick={() => {
                setOpen(false)
                onDelete(post.id)
              }}
            >
              Delete post
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-vintage-muted uppercase">{label}</p>
    </div>
  )
}
